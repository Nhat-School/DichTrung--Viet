import type { Reply, Request } from './types';
import { AppError } from './types';
export async function request<T>(message: Request): Promise<T> {
  const result: Reply<T> = await chrome.runtime.sendMessage(message);
  if (!result) throw new AppError('DISCONNECTED', 'Extension vừa được tải lại. Hãy tải lại trang mua hàng.');
  if (!result.ok) throw new AppError(result.code || 'ERROR', result.error);
  return result.data;
}
