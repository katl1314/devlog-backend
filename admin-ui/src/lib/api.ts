import { clearTokens } from './auth'

async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const token = localStorage.getItem('accessToken')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401 || res.status === 403) {
    clearTokens()
    window.location.hash = '#/login'
    return null
  }

  if (res.status === 204) return null

  const data = (await res.json()) as { message?: string }
  if (!res.ok) throw new Error(data.message ?? '요청 실패')
  return data
}

export function apiGet(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  ) as Record<string, string>
  const qs = new URLSearchParams(filtered).toString()
  return apiFetch(qs ? `${path}?${qs}` : path)
}

export function apiPatch(path: string, body: unknown = {}) {
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export function apiDelete(path: string) {
  return apiFetch(path, { method: 'DELETE' })
}

export async function loginApi(email: string, password: string) {
  const credentials = btoa(`${email}:${password}`)
  const res = await fetch('/auth/signIn/credentials', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}` },
  })
  const data = (await res.json()) as { message?: string; accessToken: string; refreshToken: string }
  if (!res.ok) throw new Error(data.message ?? '로그인 실패')
  return data
}
