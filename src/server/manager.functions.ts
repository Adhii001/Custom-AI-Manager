import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { runOperation } from './manager.server'

type ManagerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

async function invoke<T = any>(
  path: string,
  method = 'GET',
  options: { form?: FormData; search?: URLSearchParams } = {},
): Promise<ManagerResult<T>> {
  const response = await runOperation(getRequest(), path, method, options.search, options.form)
  setResponseHeader('Cache-Control', 'no-store')
  const cookies = response.headers.getSetCookie()
  if (cookies.length) setResponseHeader('Set-Cookie', cookies)
  if (!response.ok) {
    const { error } = await response.json()
    return { ok: false, status: response.status, error }
  }
  const data = response.headers.get('content-type') === 'text/csv'
    ? await response.text()
    : await response.json()
  return { ok: true, data }
}

function readForm(data: unknown) {
  if (!(data instanceof FormData)) throw new Error('Expected form data.')
  return data
}

function readFilters(data: unknown) {
  if (typeof data !== 'string') throw new Error('Expected usage filters.')
  return data
}

export const getSession = createServerFn().handler(async () => {
  const result = await invoke<{email: string}>('/session')
  return result.ok ? result.data : null
})
export const signIn = createServerFn({ method: 'POST' }).validator(readForm)
  .handler(({ data }) => invoke<{email: string}>('/login', 'POST', { form: data }))
export const signOut = createServerFn({ method: 'POST' })
  .handler(() => invoke('/logout', 'POST'))
export const getKeys = createServerFn().handler(() => invoke('/managed-keys'))
export const getSavedKeys = createServerFn().handler(() => invoke('/saved-keys'))
export const createKey = createServerFn({ method: 'POST' }).validator(readForm)
  .handler(({ data }) => invoke('/keys', 'POST', { form: data }))
function readKeyId(id: unknown) {
  if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw new Error('Invalid key ID.')
  return id
}

export const revokeKey = createServerFn({ method: 'POST' }).validator(readKeyId)
  .handler(({ data }) => invoke('/keys/'+data, 'DELETE'))
export const getKeyValue = createServerFn({ method: 'POST' }).validator(readKeyId)
  .handler(({ data }) => invoke<{value: string}>('/keys/'+data+'/value', 'POST'))
export const getUsage = createServerFn().validator(readFilters).handler(({ data }) => {
  const search = new URLSearchParams(data)
  search.delete('format')
  return invoke('/usage', 'GET', { search })
})
export const exportUsage = createServerFn().validator(readFilters).handler(({ data }) => {
  const search = new URLSearchParams(data)
  search.set('format', 'csv')
  return invoke<string>('/usage', 'GET', { search })
})
