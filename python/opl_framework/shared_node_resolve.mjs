// Bridge project build scripts (ESM/CJS) to an OPL shared node_modules pool
// without duplicating project-level node_modules directories or symlinks.
import module from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sharedRoot =
  process.env.OPL_SHARED_NODE_MODULES
  || (process.env.OPL_SHARED_NODE_MODULES_ENV ? process.env[process.env.OPL_SHARED_NODE_MODULES_ENV] : undefined);

function isBareSpecifier(specifier) {
  return (
    typeof specifier === 'string' &&
    specifier.length > 0 &&
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('node:') &&
    !specifier.startsWith('file:') &&
    !specifier.startsWith('data:')
  );
}

if (sharedRoot && typeof module.registerHooks === 'function') {
  const syntheticParent = pathToFileURL(
    path.join(sharedRoot, '__opl_shared_node_resolver__.mjs'),
  ).href;
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (isBareSpecifier(specifier) && context.parentURL !== syntheticParent) {
          return nextResolve(specifier, { ...context, parentURL: syntheticParent });
        }
        throw error;
      }
    },
  });
}
