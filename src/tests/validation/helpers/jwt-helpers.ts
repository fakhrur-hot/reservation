import 'dotenv/config';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

export function makeCustomerToken(sub: string, email: string): string {
  return jwt.sign({ sub, email }, JWT_SECRET, { expiresIn: '1h' });
}

export function makeStaffToken(
  sub: string,
  email: string,
  role: 'waiter' | 'manager' | 'admin',
  branchId: string
): string {
  return jwt.sign({ sub, email, role, branch_id: branchId }, JWT_SECRET, { expiresIn: '1h' });
}

export function decodeTokenPayload(token: string): Record<string, unknown> {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== 'object') {
    return {};
  }
  return decoded as Record<string, unknown>;
}
