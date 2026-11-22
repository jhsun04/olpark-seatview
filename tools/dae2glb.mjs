// DAE → GLB 변환 (assimp WASM). 사용: node dae2glb.mjs <in.dae> <out.glb>
import fs from 'node:fs';
import path from 'node:path';
import assimpjs from 'assimpjs';

const [, , input, output] = process.argv;
const ajs = await assimpjs();
const files = new ajs.FileList();
files.AddFile(path.basename(input), new Uint8Array(fs.readFileSync(input)));
const res = ajs.ConvertFileList(files, 'glb2');
if (!res.IsSuccess() || res.FileCount() === 0) {
  console.error('변환 실패:', res.GetErrorCode());
  process.exit(1);
}
const f = res.GetFile(0);
fs.writeFileSync(output, f.GetContent());
console.log('ok', output, (f.GetContent().length / 1048576).toFixed(1) + 'MB');
