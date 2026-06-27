export const ADMIN_EMAIL = 'juliaodaramola@gmail.com'

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase().trim() === ADMIN_EMAIL
}
