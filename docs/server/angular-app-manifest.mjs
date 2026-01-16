
export default {
  bootstrap: () => import('./main.server.mjs').then(m => m.default),
  inlineCriticalCss: true,
  baseHref: '/geographic_gas',
  locale: undefined,
  routes: [
  {
    "renderMode": 2,
    "route": "/geographic_gas"
  }
],
  entryPointToBrowserMapping: undefined,
  assets: {
    'index.csr.html': {size: 4933, hash: 'dc5b2beba92538039e13a9a6bfd2edabbe62cfeb478bccefabfe40e0d7fe57d7', text: () => import('./assets-chunks/index_csr_html.mjs').then(m => m.default)},
    'index.server.html': {size: 4784, hash: 'cf302e307ef9d4b40b5e71968961296665b4a911f7e6fb31fd64d16dcabfcb1c', text: () => import('./assets-chunks/index_server_html.mjs').then(m => m.default)},
    'index.html': {size: 10521, hash: '3fcd77567bd0d2c52b3f54201ca7e75bd01811d7296724a2d95f04c20ffede86', text: () => import('./assets-chunks/index_html.mjs').then(m => m.default)},
    'styles-DE7W5AHY.css': {size: 537, hash: 'Qk6rXltcaqE', text: () => import('./assets-chunks/styles-DE7W5AHY_css.mjs').then(m => m.default)}
  },
};
