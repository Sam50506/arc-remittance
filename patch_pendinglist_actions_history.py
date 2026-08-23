path = "src/components/admin/PendingScheduledList.jsx"
with open(path) as f:
    content = f.read()

old_import = "import { SCHED_ADDR, ARC_RPC_FALLBACK, ARC_RPC_FALLBACK2, ARC_RPC_FALLBACK3, ARC_CHAIN_ID, ADMIN_ADDRESS, short, fmtUsdc, fmtDate, fmtTime } from '../../config';"
new_import = "import { SCHED_ADDR, ARC_RPC_FALLBACK, ARC_RPC_FALLBACK2, ARC_RPC_FALLBACK3, ARC_CHAIN_ID, ADMIN_ADDRESS, short, fmtUsdc, fmtDate, fmtTime, SB_URL, SB_KEY } from '../../config';"

old_state = "  const [result,setResult]=React.useState(null);"
new_state = """  const [result,setResult]=React.useState(null);
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
  React.useEffect(()=>{loadPastActions();},[loadPastActions]);"""

old_admin_action_end = """      if(d.error){setResult({id,type:'error',msg:d.error});}
      else{setResult({id,type:'success',msg:(action==='cancel_refund'?'Cancelled & refunded. ':'Marked under review. ')+(d.failureReason?'Failure reason: '+d.failureReason:'')});if(action==='cancel_refund')load();}
    }catch(e){setResult({id,type:'error',msg:e.message});}
    setExecId(null);
  };"""

new_admin_action_end = """      if(d.error){setResult({id,type:'error',msg:d.error});}
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
  };"""

old_return_start = "  return(<div>\n    {rows.map(p=>("
new_return_start = """  const pastActionsSection = pastActions.length>0 && (
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
    {rows.map(p=>("""

ok = True
if old_import not in content:
    print("STEP 1 FAILED (import)"); ok=False
else:
    content = content.replace(old_import, new_import, 1)
if old_state not in content:
    print("STEP 2 FAILED (state)"); ok=False
else:
    content = content.replace(old_state, new_state, 1)
if old_admin_action_end not in content:
    print("STEP 3 FAILED (adminAction end)"); ok=False
else:
    content = content.replace(old_admin_action_end, new_admin_action_end, 1)
if old_return_start not in content:
    print("STEP 4 FAILED (return start)"); ok=False
else:
    content = content.replace(old_return_start, new_return_start, 1)

with open(path, "w") as f:
    f.write(content)
print("Done - check STEP messages above")
