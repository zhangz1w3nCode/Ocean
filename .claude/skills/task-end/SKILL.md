---
name: task-end
description: 任务收尾记录操作
---
# 任务流程
- 1.回顾整场对话内容
- 2.更新`.task/{task-name}/`的产物/进度等信息确保信息一致 同时更新`.task/INDEX.md`
  - `INDEX.md`追加更新 更新内容模版:
    ```markdown
    ### {task-name}
    - **创建时间**:{create-time}
    - **摘要**: {task-summary}
    - **详情**: [[`.tasks/{task-name}`]]
    ```
- 3.使用`timeline`skill帮我将对话内容存储为记忆时间线

# 强制要求
- 严格按照任务流程执行