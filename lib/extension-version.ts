import manifest from '@/chrome-extension/manifest.json';
export const latestExtensionVersion=manifest.version;
export function extensionVersionInfo(){return {version:latestExtensionVersion,requiredVersion:latestExtensionVersion,downloadPath:'/extension'};}
// Admit new QCs only on the deployed version. Photo reads and result reporting
// remain available so an already-started QC can finish across a deployment.
export function requireCurrentExtension(request:Request):Response|null{
  if(request.headers.get('X-TQA-Extension-Version')===latestExtensionVersion)return null;
  return Response.json({error:{code:'EXTENSION_UPDATE_REQUIRED',message:`Update the TQA extension to v${latestExtensionVersion} before starting another QC.`,latestVersion:latestExtensionVersion,downloadPath:'/extension'}},{status:426,headers:{'Cache-Control':'private, no-store'}});
}
