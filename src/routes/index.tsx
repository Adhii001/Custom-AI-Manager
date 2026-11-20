import { createFileRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef, type FormEvent } from 'react'

import { createKey, exportUsage, getKeyValue, getKeys, getSession, getUsage, revokeKey, signIn, signOut } from '../server/manager.functions'

export const Route = createFileRoute('/')({
 loader: () => getSession(),
 component: App,
})

async function unwrap<T>(
 request: Promise<{ok: true; data: T} | {ok: false; status: number; error: string}>,
 expireOnUnauthorized = true,
) {
 const result = await request
 if (result.ok) return result.data
 if (result.status === 401 && expireOnUnauthorized) window.dispatchEvent(new Event('expired'))
 throw new Error(result.error)
}
const message=(e:unknown)=>e instanceof Error?e.message:'Request failed.'
function Brand(){return <div className="brand"><b aria-hidden="true">⌘</b> Custom AI Manager</div>}
function ThemeToggle(){
 const [dark,setDark]=useState(false)
 useEffect(()=>{
   setDark(document.documentElement.dataset.theme==='dark')
 },[])
 function toggle(){
   const theme=document.documentElement.dataset.theme==='dark'?'light':'dark'
   document.documentElement.dataset.theme=theme
   setDark(theme==='dark')
   try { localStorage.setItem('manager-theme',theme) } catch { /* Storage can be disabled. */ }
 }
 const label=dark?'Switch to light mode':'Switch to dark mode'
 return <button type="button" className="secondary theme-toggle" onClick={toggle} aria-label={label} title={label}>
   <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
     <g className="theme-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></g><path className="theme-moon" d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.8 8.8 0 1 0 10.7 10.7Z"/>
   </svg>
 </button>
}
function App(){
 const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false}}}))
 const session = Route.useLoaderData()
 const [email,user]=useState(session?.email ?? ''),[err,error]=useState(''),[busy,work]=useState(false)
 useEffect(()=>{
 localStorage.removeItem('customai_jwtToken')
 localStorage.removeItem('externalToken')
 const expire=()=>{client.clear();user('');error('Your session expired. Sign in again.')}
 window.addEventListener('expired',expire);return ()=>window.removeEventListener('expired',expire)},[client])
 async function login(e:FormEvent<HTMLFormElement>){e.preventDefault();const body=new FormData(e.currentTarget);work(true);error('')
 try{user((await unwrap(signIn({data:body}),false)).email)}catch(x){error(message(x))}finally{work(false)}}
 if(!email) return <main className="login"><aside><Brand/><div className="art" aria-hidden="true"><i/><i/><i/><i/></div><div className="intro"><small>INFRASTRUCTURE</small><h1>AI operations<br/>workspace</h1><p>Manage project keys and monitor provider usage.</p></div></aside><section className="signin"><ThemeToggle/><form onSubmit={login}><small>PLATFORM ACCESS</small><h2>Sign in</h2><p>Use your organization’s platform account.</p><label>Email address<input name="email" type="email" autoComplete="username" required placeholder="you@company.com"/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label>{err && <p role="alert">{err}</p>}<button disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></section></main>
 return <QueryClientProvider client={client}><Dashboard email={email} logout={async()=>{await unwrap(signOut());client.clear();user('');error('')}}/></QueryClientProvider>
}
const date=(n:number|null,empty:string)=>n==null?empty:new Date(n*1000).toLocaleString()
function Dashboard({email,logout}:{email:string,logout:()=>Promise<void>}){
 const [page,setPage]=useState('Keys'),[form,show]=useState(false),[revoke,confirm]=useState<any>(null),[secret,reveal]=useState(''),[busy,work]=useState(false),[err,error]=useState(''),[copied,copy]=useState(false)
 const [usageKey,setUsageKey]=useState('')
 const [selectedKey,setSelectedKey]=useState<KeyDetailsRecord|null>(null)
 const keys=useQuery({queryKey:['keys'],queryFn:()=>unwrap(getKeys())})
 async function action(op:()=>Promise<void>){work(true);error('');try{await op()}catch(x){error(message(x))}finally{work(false)}}
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const body=new FormData(e.currentTarget);await action(async()=>{show(false);try{const k=await unwrap(createKey({data:body}));reveal(k.value);copy(false)}finally{await keys.refetch()}})}
 return <div className="dashboard"><header><Brand/><div className="account"><ThemeToggle/><span>{email}</span> <button className="secondary" onClick={()=>action(logout)}>Sign out</button></div></header><main className="workspace manager-layout"><nav className="manager-sidebar" aria-label="Project management">
 <button aria-current={page==='Keys'?'page':undefined} onClick={()=>setPage('Keys')}>API keys</button>
 <button aria-current={page==='Usage'?'page':undefined} onClick={()=>{setUsageKey('');setPage('Usage')}}>Usage</button>
 </nav><div className="manager-content">
 {err && <p role="alert">{err}</p>}
 {page==='Usage'?<Usage key={usageKey} initialKeyId={usageKey}/>:<><section className="heading"><div><h1>API keys</h1></div><button disabled={busy} onClick={()=>show(true)}>＋ Create key</button></section>
 <section className="panel"><div className="toolbar"><h3>Project keys</h3><button className="secondary" disabled={keys.isFetching} onClick={()=>keys.refetch()}>{keys.isFetching?'Refreshing…':'Refresh'}</button></div>
 {keys.error && <p role="alert">{message(keys.error)}</p>}
 {keys.dataUpdatedAt>0 && <p>Last updated {new Date(keys.dataUpdatedAt).toLocaleTimeString()}</p>}
 <div className="scroll"><table><thead><tr>{['Key','Name / ID','Owner','Created','Last used','Status','Actions'].map(x=><th key={x} scope="col">{x}</th>)}</tr></thead>
 <tbody>{keys.data?.keys.map((key:any)=><tr className="key-row" key={key.id} onClick={event=>{
   if (!(event.target instanceof Element) || !event.target.closest('button')) setSelectedKey(key)
 }}>
   <td><code>{key.redacted_value}</code></td>
   <td><button className="key-name" onClick={()=>setSelectedKey(key)}>{key.name}</button><code>{key.id}</code></td>
   <td>{key.owner||'Unassigned'}</td>
   <td>{date(key.created_at,'—')}</td>
   <td>{date(key.last_used_at,'Never used')}</td>
   <td><span className={key.revoked_at?"pill revoked":"pill"}>{key.revoked_at?'Revoked':'Active'}</span></td>
   <td><div className="key-actions">
     <button className="secondary" onClick={()=>{setUsageKey(key.id);setPage('Usage')}}>View usage</button>
     {!key.revoked_at && <button className="secondary" disabled={busy} onClick={()=>confirm(key)}>Revoke</button>}
   </div></td>
 </tr>)}</tbody></table></div>{keys.data?.keys.length===0 && <p>No project keys yet.</p>}</section></>}
 </div>
 {selectedKey && <KeyDetails key={selectedKey.id} record={selectedKey} onClose={()=>setSelectedKey(null)}/>}
 {(form||secret||revoke) && <dialog open aria-label={form?'Create key':secret?'New key':'Revoke key'}><div>{form?<form onSubmit={create}><h2>Create key</h2><label>Key name<input autoFocus required name="name"/></label><label>Owner user ID<input required name="owner"/></label>
 <footer><button type="button" className="secondary" onClick={()=>show(false)}>Cancel</button><button disabled={busy}>Create and save</button></footer></form>:secret?<><h2>Key created</h2><input readOnly value={secret} aria-label="API key value" onFocus={e=>e.target.select()}/><footer><button className="secondary" onClick={()=>reveal('')}>Done</button><button onClick={()=>navigator.clipboard.writeText(secret).then(()=>copy(true)).catch(()=>error('Select the value and copy it manually.'))}>{copied?'Copied':'Copy key'}</button></footer></>:<><h2>Revoke {revoke.name}?</h2><p>Access using <code>{revoke.id}</code> will stop.</p><footer><button className="secondary" disabled={busy} onClick={()=>confirm(null)}>Cancel</button><button disabled={busy} onClick={()=>action(async()=>{const id=revoke.id;confirm(null);try{await unwrap(revokeKey({data:id}))}finally{await keys.refetch()}})}>Revoke key</button></footer></>}</div></dialog>}
 </main></div>
}
type KeyDetailsRecord = {id:string; name:string; redacted_value:string; owner?:string}

function KeyDetails({record,onClose}:{record:KeyDetailsRecord;onClose:()=>void}){
 const dialog = useRef<HTMLDialogElement>(null)
 const [value,setValue] = useState('')
 const [loading,setLoading] = useState(true)
 const [visible,setVisible] = useState(false)
 const lookup = useRef<ReturnType<typeof getKeyValue> | null>(null)
 const [copied,setCopied] = useState(false)
 const [error,setError] = useState('')
 useEffect(()=>{
   const element = dialog.current
   element?.showModal()
   let mounted = true
   lookup.current ??= getKeyValue({data:record.id})
   unwrap(lookup.current).then(result=>{
     if (mounted) setValue(result.value)
   }).catch(cause=>{
     if (mounted) setError(message(cause))
   }).finally(()=>{
     if (mounted) setLoading(false)
   })
   return ()=>{
     mounted = false
     element?.close()
   }
 },[record.id])

 async function copyValue(){
   try {
     await navigator.clipboard.writeText(value)
     setCopied(true)
   } catch {
     setError('Select the key value and copy it manually.')
   }
 }

 return <dialog className="key-detail" ref={dialog} aria-labelledby="key-details-title" onCancel={event=>{event.preventDefault();onClose()}}>
   <div>
     <h2 id="key-details-title">{record.name}</h2>
     <dl className="key-meta"><dt>Key ID</dt><dd><code>{record.id}</code></dd><dt>Owner</dt><dd>{record.owner || "Unassigned"}</dd></dl>
     {visible ? (
       <label>Full API key<textarea rows={3} readOnly spellCheck={false} value={value} onFocus={event=>event.target.select()}/></label>
     ) : (
       <p>API key is hidden. Reveal it to view or copy the full key.</p>
     )}
     {error && <p role="alert">{error}</p>}
     <footer>
       <button className="secondary" onClick={onClose}>Close</button>
       {visible ? <>
         <button className="secondary" onClick={()=>{setVisible(false);setCopied(false);setError('')}}>Hide key</button>
         <button onClick={copyValue}>{copied?'Copied':'Copy full key'}</button>
       </> : <button disabled={loading || !value} onClick={()=>setVisible(true)}>{loading?'Loading key…':'Reveal key'}</button>}
     </footer>
   </div>
 </dialog>
}

function Usage({initialKeyId}:{initialKeyId:string}){
 const [filters,set]=useState(()=>new URLSearchParams(initialKeyId?{group_by:'key',key_id:initialKeyId}:{group_by:'key'}).toString())
 const q=useQuery({queryKey:['usage',filters],queryFn:()=>unwrap(getUsage({data:filters}))})
 const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('')
 async function downloadCsv(){
   setExporting(true)
   setExportError('')
   try {
     const csv = await unwrap(exportUsage({data:filters}))
     const url = URL.createObjectURL(new Blob([csv], {type:'text/csv'}))
     const link = document.createElement('a')
     link.href = url
     link.download = 'usage.csv'
     link.click()
     setTimeout(() => URL.revokeObjectURL(url), 1000)
   } catch (error) {
     setExportError(message(error))
   } finally {
     setExporting(false)
   }
 }
 const rows=Array.isArray(q.data)?q.data:q.data?.data
 const tabular=Array.isArray(rows)&&rows.every(x=>x&&typeof x==='object'&&!Array.isArray(x))
 const columns=tabular?Array.from(new Set<string>(rows.flatMap((r:any)=>Object.keys(r)))):[]
 return <><section className="heading"><div><h1>Usage</h1></div><button className="secondary" disabled={exporting} onClick={downloadCsv}>{exporting?'Exporting…':'Export CSV'}</button></section>{exportError && <p role="alert">{exportError}</p>}<section className="panel"><form className="filters" onSubmit={e=>{e.preventDefault();const params=new URLSearchParams();new FormData(e.currentTarget).forEach((v,k)=>{if(v)params.set(k,String(v))});if(params.toString()===filters)q.refetch();else set(params.toString())}}><label>Group by<select name="group_by"><option value="key">Key</option><option value="day">Day</option><option value="key,day">Key and day</option></select></label><label>Start date<input type="date" name="start_date"/></label><label>End date<input type="date" name="end_date"/></label><label>Key ID<input name="key_id" defaultValue={initialKeyId}/></label><button>Apply</button></form>{q.isFetching && <p>Loading usage…</p>}{q.error && <p role="alert">{message(q.error)}</p>}{tabular?(rows.length?<div className="scroll"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r:any,i:number)=><tr key={i}>{columns.map(c=><td key={c}>{typeof r[c]==='object'?JSON.stringify(r[c]):String(r[c]??'—')}</td>)}</tr>)}</tbody></table></div>:<p>No usage in this period.</p>):q.data && <pre>{JSON.stringify(q.data,null,2)}</pre>}</section></>
}
