// Shim — wires the shared ClientErrorLogger to window.ClientErrorLogger
// so this project's existing global-IIFE call sites (`window.ClientErrorLogger.install()`)
// keep working unchanged. Also configures per-project options.

import { ClientErrorLogger as SharedLogger } from '../../shared/error-logger.js';

if (typeof window !== 'undefined') {
  window.ClientErrorLogger = {
    install: () => SharedLogger.install({
      logDir: '/Kamikazzi3D_Logs',
      getAnalyticsConfig: () =>
        (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.analytics) || { enabled: false },
    }),
    report: SharedLogger.report,
    flush:  SharedLogger.flush,
  };
}
