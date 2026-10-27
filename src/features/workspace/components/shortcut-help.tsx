import { keyboardHelp } from '../model/workspace-layout';
export function ShortcutHelp() { return <dl className="shortcut-help">{keyboardHelp.map(([key,label])=><div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>; }
