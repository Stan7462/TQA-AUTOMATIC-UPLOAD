export {PATCH} from '@/app/api/super-admin/companies/[id]/route';
// Cancellation preserves records. Permanent company erasure is not exposed here.
export async function DELETE(){return Response.json({error:'Use the super admin subscription controls to cancel a company while preserving its records.'},{status:405,headers:{Allow:'PATCH'}});}
