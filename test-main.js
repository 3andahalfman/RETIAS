var desc = Object.getOwnPropertyDescriptor(process, 'type');
console.log('descriptor:', JSON.stringify(desc));
// Also check process prototype
var proto = Object.getPrototypeOf(process);
var protoDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'type') : null;
console.log('proto descriptor:', JSON.stringify(protoDesc));
// Check all process keys for anything related
var keys = Object.keys(process).filter(k => k.includes('type') || k.includes('electron') || k.includes('browser') || k.includes('renderer'));
console.log('process keys with type/electron/browser/renderer:', keys);
process.exit(0);
