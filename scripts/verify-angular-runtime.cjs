const fs=require('fs');
const expected='20.3.16';
const packages=['@angular/core','@angular/common','@angular/compiler','@angular/forms','@angular/platform-browser','@angular/router'];
for(const pkg of packages){
  let resolved;
  try{resolved=require.resolve(`${pkg}/package.json`,{paths:[process.cwd()]});}catch{console.error(`[PG Management runtime check] missing ${pkg}. Run npm install.`);process.exit(1);}
  const version=JSON.parse(fs.readFileSync(resolved,'utf8')).version;
  if(version!==expected){console.error(`[PG Management runtime check] ${pkg}@${version} found; expected ${expected}.`);process.exit(1);}
}
console.log(`[PG Management runtime check] Angular runtime packages are aligned at ${expected}.`);
