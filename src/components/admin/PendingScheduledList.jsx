import React from 'react';
import { ethers } from 'ethers';
import { SCHED_ADDR, ARC_RPC_FALLBACK, ARC_RPC_FALLBACK2, ARC_RPC_FALLBACK3, ARC_CHAIN_ID, ADMIN_ADDRESS, short, fmtUsdc, fmtDate, fmtTime, SB_URL, SB_KEY } from '../../config';

const ABI = [
  'function paymentCount() external view returns (uint256)',
  'function getPayment(uint256 id) external view returns (tuple(address sender,address recipient,uint256 amount,uint256 releaseTime,bool executed,bool cancelled,string country))',
  'function execute(uint256 id) external'
];

const KEEPER_WINDOW_MIN = 60;

export function PendingScheduledList(){
  const [rows,setRows]=React.useState([]);
  const [loading,setLoading]=React.useState(true);
  const [err,setErr]=React.useState(null);
  const [execId,setExecId]=React.useState(null);
  const [result,setResult]=React.useState(null);
  const [pastActions,setPastActions]=React.useState([]);
  const [editingActionId,setEditingActionId]=React.useState(null);
  const [editActionReason,setEditActionReason]=React.useState('');
  const [actionBusy,setActionBusy]=React.useState(null);

  const loadPastActions=React.useCallback(async()=>{
    try{
      const r=await fetch(SB_URL+'/rest/v1/admin_payment_actions?select=*&order=created_at.desc&limit=15',{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
      setPastActions((await r.json())||[]);
    }catch(_){}
  },[]);
  React.useEffect(()=>{loadPastActions();},[loadPastActions]);

  const load=React.useCallback(async()=>{
    setLoading(true);setErr(null);
    const urls=[ARC_RPC_FALLBACK,ARC_RPC_FALLBACK2,ARC_RPC_FALLBACK3];
    let provider=null,lastErr=null;
    for(const url of urls){
      try{
        provider=new ethers.JsonRpcProvider(url,{name:'Arc Testnet',chainId:ARC_CHAIN_ID});
        await provider.getBlockNumber();
        break;
      }catch(e){lastErr=e;provider=null;}
    }
    if(!provider){setErr(lastErr?.message||'Could not reach any RPC endpoint.');setLoading(false);return;}

    try{
      const sched=new ethers.Contract(SCHED_ADDR,ABI,provider);
      const count=Number(await sched.paymentCount());
      const now=Math.floor(Date.now()/1000);
      const list=[];
      const BATCH=4;
      for(let start=0;start<count;start+=BATCH){
        const ids=[];
        for(let i=start;i<Math.min(start+BATCH,count);i++)ids.push(i);
        const results=await Promise.all(ids.map(async id=>{
          const p=await sched.getPayment(id);
          return{id,p};
        }));
        for(const{id,p}of results){
          if(p.executed||p.cancelled)continue;
          const releaseTime=Number(p.releaseTime);
          const due=releaseTime<=now;
          let status='not_due',failReason=null;
          if(due){
            const minsSince=(now-releaseTime)/60;
            try{
              const chk=await fetch('/api/check-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payment_id:id})}).then(r=>r.json());
              if(chk.ready){
                status=minsSince<KEEPER_WINDOW_MIN?'waiting_keeper':'keeper_delayed';
              }else{
                status='stuck';
                failReason=chk.reason||'Unknown';
                if(failReason==='Transfer failed'){
                  try{
                    const code=await provider.getCode(p.recipient);
                    if(code&&code!=='0x'){
                      failReason='Transfer failed - recipient is a contract with no payable receive/fallback function, so it cannot accept a plain USDC transfer';
                    }
                  }catch(_){}
                }
              }
            }catch(e){
              status='keeper_delayed';
            }
          }
          list.push({id,recipient:p.recipient,amount:p.amount,releaseTime,status,failReason,minsSince:due?(now-releaseTime)/60:null});
        }
        if(start+BATCH<count)await new Promise(r=>setTimeout(r,250));
      }
      setRows(list.sort((a,b)=>a.releaseTime-b.releaseTime));
    }catch(e){
      setErr(e.message);
    }
    setLoading(false);
  },[]);

  React.useEffect(()=>{load();},[load]);

  const executeOne=async(id)=>{
    setExecId(id);setResult(null);
    try{
      const token=sessionStorage.getItem('sp_admin_jwt');
      if(!token){alert('Session expired. Please re-verify with passkey.');window.location.reload();return;}
      const r=await fetch('/api/manual-execute',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({payment_id:id})});
      const d=await r.json();
      if(d.error){setResult({id,type:'error',msg:d.error});}
      else{setResult({id,type:'success',msg:'Executed! Hash: '+d.hash});load();}
    }catch(e){setResult({id,type:'error',msg:e.message});}
    setExecId(null);
  };

  const adminAction=async(id,action)=>{
    const reason=window.prompt(action==='cancel_refund'?'Reason for cancelling & refunding payment #'+id+':':'Reason for marking payment #'+id+' under review:');
    if(!reason||!reason.trim())return;
    setExecId(id);setResult(null);
    try{
      const token=sessionStorage.getItem('sp_admin_jwt');
      if(!token){alert('Session expired. Please re-verify with passkey.');window.location.reload();return;}
      const r=await fetch('/api/admin-payment-action',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({payment_id:id,action,reason})});
      const d=await r.json();
      if(d.error){setResult({id,type:'error',msg:d.error});}
      else{setResult({id,type:'success',msg:(action==='cancel_refund'?'Cancelled & refunded. ':'Marked under review. ')+(d.failureReason?'Failure reason: '+d.failureReason:'')});if(action==='cancel_refund')load();loadPastActions();}
    }catch(e){setResult({id,type:'error',msg:e.message});}
    setExecId(null);
  };

  const saveEditedActionReason=async(row)=>{
    const token=sessionStorage.getItem('sp_admin_jwt');
    if(!token){alert('Session expired. Please re-verify with passkey.');window.location.reload();return;}
    setActionBusy('edit_'+row.id);
    try{
      const r=await fetch('/api/edit-payment-action',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action_id:row.id,action:'edit_reason',reason:editActionReason.trim()})});
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      setEditingActionId(null);
      loadPastActions();
    }catch(e){alert('Error: '+e.message);}
    setActionBusy(null);
  };

  const deletePastAction=async(row)=>{
    if(!window.confirm('Remove this "under review" flag for payment #'+row.payment_id+'?'))return;
    const token=sessionStorage.getItem('sp_admin_jwt');
    if(!token){alert('Session expired. Please re-verify with passkey.');window.location.reload();return;}
    setActionBusy('del_'+row.id);
    try{
      const r=await fetch('/api/edit-payment-action',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action_id:row.id,action:'delete'})});
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      loadPastActions();
    }catch(e){alert('Error: '+e.message);}
    setActionBusy(null);
  };

  if(loading)return <div style={{fontSize:13,opacity:.7}}>Loading scheduled payments and checking status...</div>;
  if(err)return <div style={{fontSize:12,color:'var(--re)'}}>Error: {err} <button className="ap-btn" style={{marginTop:8}} onClick={load}>Retry</button></div>;
  if(rows.length===0)return <div style={{fontSize:13,opacity:.7}}>No active scheduled payments.</div>;

  const statusTag=(row)=>{
    if(row.status==='not_due')return null;
    if(row.status==='waiting_keeper')return <span style={{color:'var(--ac)',fontWeight:700}}>(Waiting for keeper — up to {Math.max(0,Math.ceil(60-row.minsSince))}m left)</span>;
    if(row.status==='keeper_delayed')return <span style={{color:'#e2a03f',fontWeight:700}}>(Keeper delayed — {Math.floor(row.minsSince)}m overdue, would succeed)</span>;
    if(row.status==='stuck')return <span style={{color:'var(--re)',fontWeight:700}}>(Would fail if executed now — {row.failReason})</span>;
    return null;
  };

  const pastActionsSection = pastActions.length>0 && (
    <div style={{marginTop:20}}>
      <div style={{fontSize:13,fontWeight:700,color:'var(--tx2)',marginBottom:10}}>Recent Admin Actions</div>
      {pastActions.map(row=>(
        <div key={row.id} style={{background:'var(--elev)',borderRadius:12,padding:'12px 14px',marginBottom:8,border:'1px solid var(--b1)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--tx1)'}}>#{row.payment_id}</div>
            <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:row.action==='cancel_refund'?'rgba(255,79,97,.1)':'rgba(59,130,196,.1)',color:row.action==='cancel_refund'?'var(--re)':'var(--ac)'}}>{row.action==='cancel_refund'?'Cancelled & Refunded':'Under Review'}</span>
          </div>
          {editingActionId===row.id ? (
            <div>
              <textarea value={editActionReason} onChange={e=>setEditActionReason(e.target.value)} rows={2} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--b1)',background:'var(--card)',color:'var(--tx1)',fontSize:12,outline:'none',resize:'none',boxSizing:'border-box',marginBottom:8,fontFamily:'inherit'}}/>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>saveEditedActionReason(row)} disabled={!!actionBusy} style={{flex:1,background:'var(--ac)',border:'none',color:'#fff',borderRadius:8,padding:'7px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
                <button onClick={()=>setEditingActionId(null)} style={{flex:1,background:'none',border:'1px solid var(--b1)',color:'var(--tx2)',borderRadius:8,padding:'7px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:12,color:'var(--tx2)',fontStyle:'italic',marginBottom:8}}>"{row.admin_reason||'-'}"</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{setEditingActionId(row.id);setEditActionReason(row.admin_reason||'');}} style={{flex:1,background:'none',border:'1px solid var(--b1)',color:'var(--tx2)',borderRadius:8,padding:'7px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Edit Reason</button>
                {row.action==='under_review'&&<button onClick={()=>deletePastAction(row)} disabled={!!actionBusy} style={{flex:1,background:'none',border:'1px solid var(--ac)',color:'var(--ac)',borderRadius:8,padding:'7px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Remove Flag</button>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return(<div>
    {rows.map(p=>(
      <div key={p.id} style={{padding:'12px 0',borderBottom:'1px solid var(--b0)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <div style={{fontSize:13,color:'var(--tx1)'}}>
            <div style={{fontWeight:700,color:'var(--tx1)'}}>#{p.id}: {fmtUsdc(p.amount)} USDC {statusTag(p)}</div>
            <div style={{opacity:.7,fontSize:12,color:'var(--tx2)'}}>To: {short(p.recipient)}</div>
            <div style={{opacity:.7,fontSize:12,color:'var(--tx2)'}}>Release: {fmtDate(p.releaseTime)} {fmtTime(p.releaseTime)}</div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="ap-btn ap-btn-primary" style={{marginTop:0,padding:'8px 16px'}} disabled={execId===p.id||p.status==='not_due'} onClick={()=>executeOne(p.id)}>
              {execId===p.id?'Executing...':(p.status==='not_due'?'Not due yet':'Execute Manually')}
            </button>
            <button className="ap-btn" style={{marginTop:0,padding:'8px 16px'}} onClick={()=>adminAction(p.id,'cancel_refund')}>Cancel & Refund</button>
            <button className="ap-btn" style={{marginTop:0,padding:'8px 16px'}} onClick={()=>adminAction(p.id,'under_review')}>Send Under Review</button>
          </div>
        </div>
        {result&&result.id===p.id&&<div style={{marginTop:8,fontSize:12,padding:'8px 12px',borderRadius:8,background:result.type==='success'?'rgba(23,229,176,.1)':'rgba(255,79,97,.1)',color:result.type==='success'?'var(--cy)':'var(--re)',wordBreak:'break-all'}}>{result.msg}</div>}
      </div>
    ))}
    {pastActionsSection}
  </div>);
}
