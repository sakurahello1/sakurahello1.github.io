import ast
import re
from pathlib import Path

errors, count = [], 0
for p in (Path(__file__).resolve().parents[1] / 'blog/agent-harness/source').glob('[0-9][0-9].md'):
    for n, code in enumerate(re.findall(r'```python\n([\s\S]*?)```', p.read_text(encoding='utf-8'))):
        count += 1
        try:
            ast.parse(code)
        except SyntaxError as e:
            errors.append((p.name, n, str(e)))
print({'python_snippets': count, 'AST_errors': errors})
raise SystemExit(bool(errors))
