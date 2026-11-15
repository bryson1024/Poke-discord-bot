// tools/squirtle-squad-sprites/build-special-sprites.mjs — installs the
// approved Squirtle Squad sprites (this folder) where the game reads them:
//   public/sprites/pokemon/special/normal/squad-leader.gif   (squirtle-squad.gif)
//   public/sprites/pokemon/special/normal/squad-member.gif   (squirtle-squad-member.gif)
//   public/sprites/pokemon/special/grayscale/<key>.gif        BT.709 grayscale twins
//   public/sprites/trainers_2/squirtlesquadleader.png         (squirtle-squad-leader.png)
// The grayscale twins are made the way tools/import-sprites.mjs makes
// public/sprites/pokemon/grayscale/ (tools/lib/spriteCodec.mjs). The trainer
// sprite is never listed in trainerSprites.json: the Squad's card shows it,
// but no one can own it.
//
//   node tools/squirtle-squad-sprites/build-special-sprites.mjs
import fs from "fs";
import { gifFrames, encodeGif, toGrayscale } from "../lib/spriteCodec.mjs";

const HERE = new URL("./", import.meta.url);
const P = (rel) => new URL(`../../${rel}`, import.meta.url);
const SPECIAL = { "squad-leader": "squirtle-squad.gif", "squad-member": "squirtle-squad-member.gif" };

for (const dir of ["public/sprites/pokemon/special/normal/", "public/sprites/pokemon/special/grayscale/"]) fs.mkdirSync(P(dir), { recursive: true });
for (const [key, source] of Object.entries(SPECIAL)) {
  const bytes = fs.readFileSync(new URL(source, HERE));
  fs.writeFileSync(P(`public/sprites/pokemon/special/normal/${key}.gif`), bytes);
  const { width, height, frames } = gifFrames(bytes);
  fs.writeFileSync(P(`public/sprites/pokemon/special/grayscale/${key}.gif`), encodeGif(width, height, toGrayscale(frames)));
  console.log(`special/{normal,grayscale}/${key}.gif`);
}
fs.copyFileSync(new URL("squirtle-squad-leader.png", HERE), P("public/sprites/trainers_2/squirtlesquadleader.png"));
console.log("trainers_2/squirtlesquadleader.png");
