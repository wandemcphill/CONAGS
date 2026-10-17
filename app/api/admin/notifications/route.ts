import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { getRequestId, logOperationalError, operationalError, withRequestId } from '@/lib/laurem-operational';
import { isRecoverableNotificationEvent, recoverLauremNotification } from '@/lib/laurem-notification-recovery';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');
  const params = new URL(request.url).searchParams;
  const status = params.get('status');
  const limit = Math.min(Math.max(Number(params.get('limit') || 100), 1), 250);
  try {
    let query = db().from('notification_deliveries').select('id,event_type,entity_id,channel,status,attempt_count,provider_id,last_error,last_attempt_at,sent_at,created_at,updated_at').order('created_at',{ ascending:false }).limit(limit);
    if (status && status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    const deliveries = (data || []).map((row: any) => ({ ...row, recoverable: isRecoverableNotificationEvent(String(row.event_type || '')) }));
    return withRequestId(NextResponse.json({ deliveries, operator: session.email }), requestId);
  } catch (error) {
    logOperationalError({ requestId, event:'admin.notifications.list_failed', actor:session.email, reason:error });
    return operationalError(requestId,'Unable to load notification delivery history.',500,'NOTIFICATION_HISTORY_FAILED');
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');
  const body = await request.json().catch(() => null) as { id?: string; action?: string } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id || body?.action !== 'retry') return operationalError(requestId,'A notification id and retry action are required.',400,'RETRY_REQUEST_INVALID');
  try {
    const client = db();
    const { data: delivery, error } = await client.from('notification_deliveries').select('id,event_type,entity_id,status,attempt_count,last_error').eq('id',id).maybeSingle();
    if (error) throw error;
    if (!delivery) return operationalError(requestId,'Notification delivery not found.',404,'NOTIFICATION_NOT_FOUND');
    if (delivery.status !== 'failed') return operationalError(requestId,'Only failed notifications can be retried from the recovery center.',409,'NOTIFICATION_NOT_FAILED');
    if (!delivery.entity_id || !isRecoverableNotificationEvent(String(delivery.event_type || ''))) return operationalError(requestId,'This notification does not support safe replay.',409,'NOTIFICATION_NOT_RECOVERABLE');
    const result = await recoverLauremNotification(client, delivery, session.email);
    return withRequestId(NextResponse.json({ ok: result.email.status === 'sent' || result.email.status === 'not_configured', recovery: { status: result.email.status, deliveryId: result.email.deliveryId, entityId: result.entityId } }), requestId);
  } catch (error) {
    logOperationalError({ requestId, event:'admin.notifications.retry_failed', actor:session.email, reason:error, metadata:{ deliveryId:id } });
    return operationalError(requestId,'Unable to recover this notification.',500,'NOTIFICATION_RETRY_FAILED');
  }
}
