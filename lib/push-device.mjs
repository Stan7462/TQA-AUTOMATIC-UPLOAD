// Only an explicit subscription action can replace the selected technician phone.
export async function updatePushDevice(db, user, {status, subscriptionId, activate = false}, now = Date.now()) {
  const tenant = user.tenantId, tech = user.techId;
  if (user.isAdmin) {
    await db.prepare("UPDATE push_accounts SET device_status=?,device_checked_at=? WHERE tenant_id=? AND tech_id=?").bind(status,now,tenant,tech).run();
    return true;
  }
  if (activate) {
    if (status !== "connected" || !subscriptionId) throw new Error("Subscribe this phone before activating it.");
    await db.batch([
      // One browser subscription must never remain selected for another account.
      db.prepare("UPDATE push_accounts SET active_subscription_id=NULL,device_status='not_subscribed',device_checked_at=? WHERE active_subscription_id=? AND NOT (tenant_id=? AND tech_id=?)").bind(now,subscriptionId,tenant,tech),
      db.prepare("UPDATE push_accounts SET active_subscription_id=?,device_status='connected',device_checked_at=? WHERE tenant_id=? AND tech_id=?").bind(subscriptionId,now,tenant,tech),
    ]);
  } else {
    // Reports from a replaced phone cannot overwrite the current phone's status.
    await db.prepare("UPDATE push_accounts SET device_status=CASE WHEN active_subscription_id IS NULL AND ?='connected' THEN 'unknown' ELSE ? END,device_checked_at=? WHERE tenant_id=? AND tech_id=? AND (active_subscription_id=? OR active_subscription_id IS NULL)").bind(status,status,now,tenant,tech,subscriptionId).run();
  }
  const account = await db.prepare("SELECT active_subscription_id FROM push_accounts WHERE tenant_id=? AND tech_id=?").bind(tenant,tech).first();
  return Boolean(subscriptionId && account?.active_subscription_id === subscriptionId);
}
