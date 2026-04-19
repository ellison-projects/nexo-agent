import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';

export async function compileTypst(typPath: string, pdfPath: string): Promise<void> {
      const compiler = NodeCompiler.create({ workspace: dirname(typPath) });
      const buf = compiler.pdf({ mainFilePath: typPath });
      await writeFile(pdfPath, buf);
}
