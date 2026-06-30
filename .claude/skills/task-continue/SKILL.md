---
name: task-continue
description: 任务开始和继续
---
# 任务
- 1.理解用户输入任务
- 2.使用`timeline-search-agent`帮我搜索相关任务
- 3.判断任务类型
  - 读取`.tasks/INDEX.md`再判断
  - 如果是新任务:在`~/developlement/Ocean/.tasks/{task-name}/`下创建任务 
    - 创建的任务内容:为`planning-with-files-zh`skill要求的文件
  - 如果是未完成的任务:读取`~/developlement/Ocean/.tasks/{task-name}/`下的全部文件再继续任务

# 强制要求
- 使用skill工具读取对应的skill
- 严格按照skill的约束和规则执行