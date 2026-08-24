const fs = require('fs');
['plans', 'remotes', 'sources'].forEach(type => {
  const file = `src/app/(dashboard)/${type}/page.tsx`;
  let content = fs.readFileSync(file, 'utf8');
  
  // import type
  const TypeName = type === 'plans' ? 'Plan' : type === 'remotes' ? 'Remote' : 'Source';
  if (!content.includes(`import { ${TypeName} }`)) {
    content = content.replace('import { Button }', `import { ${TypeName} } from "@prisma/client";\nimport { Button }`);
  }
  
  // replace state and arguments
  content = content.replace(/useState<any.*>\(null\)/g, `useState<${TypeName} | null>(null)`);
  content = content.replace(/useState<any\[\]>\(\[\]\)/g, `useState<${TypeName}[]>([])`);
  content = content.replace(`openEdit = (${TypeName.toLowerCase()}: any)`, `openEdit = (${TypeName.toLowerCase()}: ${TypeName})`);
  content = content.replace(new RegExp(`openEdit = \\(item: any\\)`, 'g'), `openEdit = (item: ${TypeName})`);
  content = content.replace(new RegExp(`openEdit = \\([a-z]+: any\\)`, 'g'), `openEdit = (item: ${TypeName})`);
  
  // Also logs client needs a fix? We already fixed it.
  
  fs.writeFileSync(file, content);
});
