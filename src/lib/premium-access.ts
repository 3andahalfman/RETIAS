import { isAdminEmail } from './admin'

export function hasPremiumPlusAccess(user: { email?: string; is_premium_plus?: boolean }): boolean {
  return !!user.is_premium_plus || isAdminEmail(user.email)
}
