path = '/home/ubuntu/amhblogs/public/js/public.js'
with open(path, 'r') as f:
    lines = f.readlines()

new_content = [
    '  function updateSiteContent() {\n',
    '    const s = state.site;\n',
    '    if (s.about) { .textContent = (s.about[state.lang] || s.about); .hidden = false; }\n',
    '    .textContent = (s.footer[state.lang] || s.footer || \'\');\n',
    '  }\n'
]

# Insert after applyLang() definition (applyLang ends on line 36 in original file)
# Wait, need to find the correct line index again because I modified it, but I reverted it.
# Let's just find the end of applyLang (which ends with )
for i, line in enumerate(lines):
    if '  }' in line and i > 25: # Find the closing brace of applyLang
        lines.insert(i + 1, '\n')
        lines[i+2:i+2] = new_content
        break

# Update change handler
for i, line in enumerate(lines):
    if 'applyLang(); await loadTopics(); route();' in line:
        lines[i] = '    applyLang(); updateSiteContent(); await loadTopics(); route();\n'

# Update boot function
for i, line in enumerate(lines):
    if 'applyLang();' in line and 'await' not in line:
        lines[i] = '    applyLang();\n    updateSiteContent();\n'
        break

with open(path, 'w') as f:
    f.writelines(lines)
