import { randomBytes } from 'node:crypto'

type Session = { email:string, token:string, platformCookie:string, expires:number }
const sessions = new Map<string, Session>()
class Failure extends Error { constructor(public status:number, message:string){ super(message) } }
const json = (body:unknown,status=200,headers={}) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}})
const field = (data:FormData,name:string) => {
  const value=data.get(name)
  if(typeof value!=='string'||!value.trim()) throw new Failure(400,'Missing '+name)
  return value
}
function setting(name:string){
  const value=process.env[name]?.trim()
  if(!value) throw new Failure(503,'Configure '+name+' on the server.')
  return value
}
const platform = () => setting('Platform_URL').replace(/\/+$/,'')
const send = (url:string,options:RequestInit={}) => fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)})
async function provider(path:string,method='GET',body?:unknown){
  return send(setting('API_KEY_PROVIDER_BASE_URL').replace(/\/+$/,'')+path,{method,headers:{Authorization:'Bearer '+setting('API_KEY_PROVIDER_ADMINKEY'),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
}
async function login(request:Request,data:FormData){
  const email=field(data,'email').trim(), password=field(data,'password')
  const root=platform(), url=root+'/user.signin'
  const cookies=new Map<string,string>()
  function capture(r:Response){for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0], i=pair.indexOf('='); cookies.set(pair.slice(0,i),pair.slice(i+1))}}
  const cookie=()=>Array.from(cookies,([k,v])=>k+'='+v).join('; ')
  const page=await send(url)
  if(!page.ok) throw new Failure(502,'Platform sign-in page unavailable.')
  capture(page)
  const html=await page.text(), form=new FormData()
  for(const name of ['__f','_CSRF']){
    const tag=html.match(/<input\b[^>]*>/gi)?.find(t=>new RegExp('name=["\']'+name+'["\']','i').test(t))
    const value=tag?.match(/\bvalue=["']([^"']*)["']/i)?.[1] || ''
    if(value||name==='__f') form.set(name,value)
  }
  form.set('_fm[email]',email); form.set('_fm[pass]',password); form.set('_fm[__s]','Sign In')
  const result=await send(url,{method:'POST',headers:{Cookie:cookie()},body:form})
  capture(result)
  if(result.status>=400 || /Invalid Email or Password|error messages/i.test(await result.text())) throw new Failure(401,'Email or password was rejected.')
  const op=new FormData(); op.set('op','user.jwt.externalauth')
  const auth=await send(root+'/sys/api.v1',{method:'POST',headers:{Cookie:cookie(),Authorization:'Basic '+Buffer.from(email+':'+password).toString('base64')},body:op})
  capture(auth)
  const token=auth.ok && (await auth.json()).Body?.JWTtoken
  if(!token) throw new Failure(401,'Platform sign-in failed.')
  const exp=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).exp
  const expires=Math.min(Date.now()+8*3600000, typeof exp==='number'?exp*1000:Infinity)
  if(expires<=Date.now()) throw new Failure(401,'Platform token expired.')
  for(const [key,s] of sessions) if(s.expires<=Date.now()) sessions.delete(key)
  const id=randomBytes(32).toString('hex')
  sessions.set(id,{email,token,platformCookie:cookie(),expires})
  return json({email},200,{'Set-Cookie':'manager='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+Math.floor((expires-Date.now())/1000)+(new URL(request.url).protocol==='https:'?'; Secure':'')})
}

const workflowPath = '/workflow.trigger/insertapikeydetails6af41a4d2edbf'

async function create(data:FormData,session:Session){
  const response=await provider('/project/keys','POST',{name:field(data,'name').trim(),metadata:{user_id:field(data,'owner').trim()}})
  if(!response.ok) throw new Failure(502,'Provider rejected key creation. Refresh the key list before retrying.')
  const key=await response.json()
  if(!key.id||!key.value) throw new Failure(502,'Incomplete create response. Check the provider key list.')
  const form=new FormData()
  for (const [name, value] of Object.entries(key)) {
    form.set(name, value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
  if (key.metadata?.user_id != null) form.set('user_id', String(key.metadata.user_id))
  const unknown='Save via '+workflowPath+' unconfirmed for '+key.id+'. Check the workflow record by ID before creating another key.'
  try {
    const r=await send(platform()+workflowPath,{method:'POST',credentials:'include',headers:{Authorization:'Bearer '+session.token,Cookie:session.platformCookie},body:form})
    if ([401,403].includes(r.status) || (r.status>=300 && r.status<400)) {
      throw new Failure(502, workflowPath+' returned HTTP '+r.status+' for '+key.id+'. Sign in again and check the workflow record before creating another key.')
    }
    const body = await r.text()
    let receipt
    try { receipt = JSON.parse(body) } catch { /* Triggers may return plain text or an empty body. */ }
    const rejected = receipt?.saved === false && receipt.id === key.id
    if (!rejected) {
      if (!r.ok) throw new Failure(502, 'Workflow returned HTTP '+r.status+'. '+unknown)
      if (receipt?.saved === false || receipt?.success === false || receipt?.error || (receipt?.saved === true && receipt.id !== key.id)) {
        throw new Failure(502, unknown)
      }
      return json({id:key.id,value:key.value},201)
    }
  } catch (error) {if(error instanceof Failure) throw error; throw new Failure(502,unknown)}
  const revoked=await provider('/project/keys/'+encodeURIComponent(key.id),'DELETE').catch(()=>null)
  throw new Failure(502,revoked?.ok?'Platform rejected the save. The new key was revoked.':'Platform rejected the save. Check and revoke key '+key.id+'.')
}
async function readSavedRows(session: Session, keyId?: string) {
  const form = new FormData()
  form.set('action', 'getdetails')
  if (keyId) form.set('Key_id', keyId)
  const response = await send(platform()+workflowPath, {
    method: 'POST',
    headers: { Authorization: 'Bearer '+session.token, Cookie: session.platformCookie },
    body: form,
  })
  if (!response.ok) throw new Failure(502,'Platform workflow read failed ('+response.status+').')
  return parseSavedRows(await response.json())
}

type SavedKey = { Name: string; Key_id?: string; Key?: string; Date_Created?: string; Status?: string; user_id?: string }

function parseSavedRows(value: unknown, depth = 0): SavedKey[] {
  if (depth > 5) throw new Failure(502, 'Unexpected workflow response.')
  if (typeof value === 'string') return parseSavedRows(JSON.parse(value), depth+1)
  if (Array.isArray(value)) {
    if (value.every(row => row && typeof row === 'object' && ('Name' in row || 'Key_id' in row))) return value as SavedKey[]
    if (value.length === 1) return parseSavedRows(value[0], depth+1)
  }
  if (value && typeof value === 'object') {
    if ('Name' in value || 'Key_id' in value) return [value as SavedKey]
    if ('Data' in value) return parseSavedRows(value.Data, depth+1)
    if ('data' in value) return parseSavedRows(value.data, depth+1)
  }
  throw new Failure(502, 'The workflow did not return spreadsheet rows.')
}

type ProviderKey = {
  id: string; name: string; redacted_value: string; created_at: number
  last_used_at: number | null; revoked_at: number | null; owner?: string
}

async function listSavedKeys(session: Session) {
  const rows = await readSavedRows(session)
  const fields = ['Name','Key_id','Date_Created','Status','user_id'] as const
  return json({data:rows.map(row=>Object.fromEntries(fields.map(name=>[name,row[name] ?? null])))})
}

async function listProviderKeys(): Promise<ProviderKey[]> {
  const response = await provider('/project/keys')
  if (!response.ok) throw new Failure(502, 'Provider request failed ('+response.status+').')
  const result = await response.json()
  return result.data.map((key: Omit<ProviderKey, 'owner'> & { metadata?: { user_id?: string } }) => ({
    id: key.id, name: key.name, redacted_value: key.redacted_value, created_at: key.created_at,
    last_used_at: key.last_used_at, revoked_at: key.revoked_at, owner: key.metadata?.user_id,
  }))
}

async function recoverKey(session: Session, id: string) {
  const rows = await readSavedRows(session, id)
  const matches = rows.filter(row => row.Key_id === id)
  if (matches.length !== 1 || typeof matches[0].Key !== 'string' || !matches[0].Key.trim()) {
    throw new Failure(404, 'No unique saved key was found for this ID.')
  }
  return json({value: matches[0].Key})
}

export function handle(request: Request) {
  const url = new URL(request.url)
  return runOperation(request, url.pathname.slice(4), request.method, url.searchParams)
}

export async function runOperation(
  request: Request, path: string, method: string,
  search = new URLSearchParams(), form?: FormData,
) {
  try {
    const url = new URL(request.url)
    if(method!=='GET' && request.headers.get('origin')!==url.origin) throw new Failure(403,'Invalid request origin.')
    if(path==='/login' && method==='POST') return await login(request, form ?? await request.formData())
    const id=request.headers.get('cookie')?.match(/(?:^|;\s*)manager=([a-f0-9]{64})(?:;|$)/)?.[1] || ''
    const session=sessions.get(id)
    if(!session || session.expires<=Date.now()){ sessions.delete(id); throw new Failure(401,'Sign in to continue.') }
    if(path==='/session' && method==='GET') return json({email:session.email})
    if(path==='/logout' && method==='POST'){sessions.delete(id);return json({},200,{'Set-Cookie':'manager=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict'})}
    if(path==='/keys' && method==='POST') {
      return await create(form ?? await request.formData(), session)
    }
    if(path==='/saved-keys' && method==='GET') return await listSavedKeys(session)
    if(path==='/managed-keys' && method==='GET') return json({keys: await listProviderKeys()})
    if(path==='/keys' && method==='GET') return json(await listProviderKeys())
    if(/^\/keys\/[\w-]+\/value$/.test(path) && method==='POST') return await recoverKey(session, path.split('/')[2])
    let upstream
    if(/^\/keys\/[\w-]+$/.test(path) && method==='DELETE') upstream=await provider('/project'+path,'DELETE')
    else if(path==='/usage' && method==='GET'){
      const filters=new URLSearchParams()
      for(const k of ['group_by','start_date','end_date','key_id','format']) if(search.get(k)) filters.set(k,search.get(k)!)
      upstream=await provider('/project/usage?'+filters)
      if(upstream.ok && filters.get('format')==='csv') return new Response(upstream.body,{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="usage.csv"','Cache-Control':'no-store'}})
    } else throw new Failure(404,'Unknown operation.')
    if(!upstream.ok) throw new Failure(502,'Provider request failed ('+upstream.status+').')
    if(method==='DELETE'){
      const keyId = path.slice('/keys/'.length)
      const form = new FormData()
      form.set('action', 'revoke')
      form.set('Key_id', keyId)
      try {
        const response = await send(platform()+workflowPath, {
          method: 'POST',
          headers: {Authorization: 'Bearer '+session.token, Cookie: session.platformCookie},
          body: form,
        })
        const body = (await response.text()).trim()
        if (!response.ok || /^internal server error$/i.test(body)) throw new Error()
        if (body.startsWith('{') || body.startsWith('[')) {
          const result = JSON.parse(body)
          const rows = Array.isArray(result) ? result : [result]
          if (rows.some(row => row?.success === false || row?.error || row?.status === 'error')) throw new Error()
        }
      } catch {
        throw new Failure(502,'The provider revoked '+keyId+'. The platform status update could not be confirmed.')
      }
      return json({revoked:true})
    }
    return json(await upstream.json())
  } catch(e){return json({error:e instanceof Failure?e.message:'Service request failed. Refresh before retrying.'},e instanceof Failure?e.status:502)}
}
