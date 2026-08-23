path = "src/components/admin/PendingScheduledList.jsx"
with open(path) as f:
    content = f.read()

old = """        {result&&result.id===p.id&&<div style={{marginTop:8,fontSize:12,padding:'8px 12px',borderRadius:8,background:result.type==='success'?'rgba(23,229,176,.1)':'rgba(255,79,97,.1)',color:result.type==='success'?'var(--cy)':'var(--re)',wordBreak:'break-all'}}>{result.msg}</div>}
      </div>
    ))}
  </div>);
}"""

new = """        {result&&result.id===p.id&&<div style={{marginTop:8,fontSize:12,padding:'8px 12px',borderRadius:8,background:result.type==='success'?'rgba(23,229,176,.1)':'rgba(255,79,97,.1)',color:result.type==='success'?'var(--cy)':'var(--re)',wordBreak:'break-all'}}>{result.msg}</div>}
      </div>
    ))}
    {pastActionsSection}
  </div>);
}"""

if old not in content:
    print("PATCH FAILED: end block not matched.")
else:
    content = content.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(content)
    print("PATCH OK: pastActionsSection now rendered")
