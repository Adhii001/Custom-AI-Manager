import { createRootRoute, HeadContent, Scripts, Outlet } from '@tanstack/react-router'
import css from '../style.css?url'
// Run synchronously in the document head, before the first themed content paints.
const initialTheme = `(function () {
  var saved;
  try { saved = localStorage.getItem('manager-theme'); } catch {}
  var dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();`
export const Route = createRootRoute({
 head:()=>({meta:[{charSet:'utf-8'},{name:'viewport',content:'width=device-width, initial-scale=1'},{title:'Custom AI Manager'}],links:[{rel:'icon',type:'image/svg+xml',href:'/favicon.svg'},{rel:'stylesheet',href:css}]}),
 component:()=> <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:initialTheme}}/><HeadContent/></head><body><Outlet/><Scripts/></body></html>
})
