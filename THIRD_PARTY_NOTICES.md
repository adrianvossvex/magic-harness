# Claude Code 提示词来源

`src/prompts.ts` 基于社区维护的 [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) 公开提取文案。

- 固定快照：[v2.1.270](https://github.com/Piebald-AI/claude-code-system-prompts/tree/v2.1.270)，提交 `709742cc554860f80671ca63fd9f8dc8015ffdf0`。
- 这是该仓库标注的 Claude Code 版本，具体片段的 `ccVersion` 表示各自最后更新的版本。
- 这是针对 magic 的适配版本，不是 Anthropic 官方发布的完整 system prompt，也不代表完整 Claude Code 的行为。运行时不下载或更新这些文案。
- 来源仓库附有 MIT License，许可原文保留在本文末尾。

原始文件位于该提交的 [system-prompts 目录](https://github.com/Piebald-AI/claude-code-system-prompts/tree/709742cc554860f80671ca63fd9f8dc8015ffdf0/system-prompts)。采用或参考的部分如下：

| magic 内容 | 来源文件 | 适配说明 |
|---|---|---|
| 主提示词 | `system-prompt-harness-instructions.md`、`system-prompt-outcome-first-communication-style.md`、`system-prompt-tone-and-style-code-references.md` | 保留 magic 身份，加入终端与 Web 的实际可见范围（工具调用折叠可见、思考不可见）、工具结果截断上限、会话工作目录、平台、本地日期与时区；沟通风格采用同一快照中较新的 outcome-first 版本，替代旧的 communication-style 与 concise-output 片段；移除未实现的权限界面、hooks、子代理和并行执行说明。 |
| 编码任务指导 | `system-prompt-doing-tasks-*.md` 中的 software-engineering-focus、ambitious-tasks、no-unnecessary-additions、no-unnecessary-error-handling、no-compatibility-hacks、security | 保留这些通用片段，补充先阅读代码、使用相关检查、区分讨论与实施的说明。 |
| 操作范围 | `system-prompt-executing-actions-with-care.md` | 完整保留原文的风险示例与可逆优先原则；确认动作改为调用 AskUserQuestion，持久授权指向项目的 AGENTS.md；补充说明 magic 没有权限弹窗、这一节就是权限系统。 |
| Read | `tool-description-readfile.md` | 明确只读 UTF-8 文本、默认最多 2000 行并返回 nextOffset、1-based offset、无行号前缀、空文件行为；移除图片、PDF、笔记本解析能力。 |
| Write | `tool-description-write.md`、`tool-description-write-read-existing-file-first.md` | 明确先读现有文件、创建父目录及实际返回值；不声称运行时强制校验已经读取。 |
| Edit | `tool-description-edit.md`、`tool-description-edit-single-replacement.md`、`tool-description-edit-minimal-old-string-guidance.md` | 使用原始文本精确匹配，说明唯一匹配、old_string 尽量短、replace_all、空替换和实际返回值。 |
| Bash | `tool-description-bash-overview.md`、`tool-description-bash-prefer-dedicated-tools.md`、`tool-description-bash-quote-file-paths.md`、`tool-description-bash-timeout.md`、`tool-description-bash-working-directory.md`、`tool-description-bash-verify-parent-directory.md`、`tool-description-bash-git-commit-and-pr-creation-instructions.md` | 保留专用工具优先、路径引用、先确认父目录及 Git 操作指导；说明每次独立进程、会话工作目录、120 秒默认超时、取消、实际输出字段和 32,000 字符的输出截断；不提供后台任务、沙箱参数或并行执行的承诺。 |
| Glob | `tool-description-glob.md` | 修改为按路径字母顺序排序，补充 ignore、隐藏文件和 .git/.magic 排除规则。 |
| Grep | `tool-description-grep.md` | 仅描述 pattern/path/glob 和逐行匹配，说明匹配过多时的截断与 shown/total 计数；不提供 type、output_mode、multiline、上下文行或 Agent 参数。 |
| WebSearch | `tool-description-websearch.md` | 保留来源链接要求；改为实际 JSON 结果及本地域名过滤，不声明美国地域限制；当前日期从主提示词获取。只用于 Kimi 搜索后端；Claude / OpenAI 的内置搜索是原生工具，没有描述文案。 |
| WebFetch | `tool-description-webfetch.md` | 使用当前模型独立提取，不携带主对话历史或工具；移除小模型、MCP 优先、缓存、HTTPS 自动升级及特殊跳转响应的承诺。只用于 Kimi 抓取后端。 |
| Web access 运行时说明 | 无上游文件 | 主提示词中按本轮的搜索/抓取后端生成的一段说明（内置工具、Kimi 工具或没有网页访问），由 magic 自行编写。 |
| EnterPlanMode | `tool-description-enterplanmode.md`、`tool-description-enterplanmode-ambiguous-tasks.md` | 保留「非简单任务优先规划」的倾向、七类适用情形与不适用情形，示例压缩为一行；在 magic 中直接切换到只读规划，不单独确认进入。实施仍需用户确认提交的计划。 |
| ExitPlanMode | `tool-description-exitplanmode.md` | 沿用无 plan 内容参数、从计划文件读取并提交审批的方式；本轮立即结束，确认后用同一会话启动新一轮。暂不实现 allowedPrompts。 |
| Plan 提示词 | `system-reminder-plan-mode-is-active.md`、`system-reminder-plan-mode-workflow.md`、`system-reminder-plan-mode-approval-tool-enforcement.md`、`system-reminder-exited-plan-mode.md` | 保留探索、设计、评审、写计划和确认流程；使用 `.magic/plans/<sessionId>.md`。澄清需求调用 AskUserQuestion；加入「规划回合只能以 AskUserQuestion 或 ExitPlanMode 结束」的约束，纯研究问题可用文字回答；不使用子代理，Bash 在规划阶段禁用。 |
| AskUserQuestion | `tool-description-askuserquestion.md`、`tool-description-askuserquestion-decision-guidance.md` | 保留「只在确实需要用户决定时提问、常规默认值自行选择」的判断标准和 Plan 模式说明；补充确认高风险操作的用法、1–4 题 2–4 选项的限制和 magic 的返回格式。 |
| Git 状态快照 | `system-prompt-git-status.md` | 会话创建或恢复时记录分支、工作区状态（最多 50 行）和最近 5 条提交，放入系统提示；快照内容由 magic 自行生成。 |
| 项目指令 | 无上游文件 | 参照 Claude Code 装载 CLAUDE.md 的方式：读取启动目录与会话文件夹中的 AGENTS.md 或 CLAUDE.md（每份最多 40,000 字符），每轮开始时重新读取。 |
| 上下文压缩摘要 | `agent-prompt-conversation-summarization.md` | 逐字保留九段式 `<analysis>` + `<summary>` 结构以及逐字保留安全约束和用户消息的要求；快照中的模板片段内联为普通文本。`/compact <说明>` 作为 `Additional Instructions` 附在末尾。magic 只把 `<summary>` 内容写入新的上下文，完整响应仍在调用记录中。 |
| 压缩请求禁用工具 | `agent-prompt-summarization-no-tools-guard.md` | 作为摘要请求的前缀，要求纯文本回复。magic 的摘要请求仍声明工具（历史中的 tool_use 块需要），模型若调用工具则视为压缩失败。 |
| 压缩后的文件引用 | `system-reminder-compact-file-reference.md` | 压缩前读取过的文件重新附在摘要之后；超出上限的文件按此文案只保留路径，提示用 Read 重新读取。 |

八个执行工具的参数结构和执行函数保持一致，Plan 模式在调用前限制工具与写入路径；Write 和 Edit 限定在会话文件夹内，其他工具不受限，描述中据实说明。用户关闭的工具不再声明；Claude 和 OpenAI 的内置搜索/抓取作为原生工具对象声明，替代同类的客户端工具。两个模式工具使用空对象参数。网页提取继续使用独立的短 system prompt，避免把主会话的编码指导带入提取请求。上下文压缩的摘要请求沿用主提示词和工具声明以命中缓存，摘要指令作为最后一条 user 消息发送。真实请求中的 `system` 和 `tools[].description` 仍完整写入日志。

## 上游许可原文

MIT License

Copyright (c) 2025 Piebald LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

<!-- bundled-packages:start -->
## 打包进发布版的第三方组件

发布版由 esbuild 打包，下列 npm 包的代码被编进了 `build/` 中的文件。本节由 `npm run notices` 根据打包结果生成，各自的许可证原文如下。

### @anthropic-ai/sdk 0.125.0

许可证：MIT · github:anthropics/anthropic-sdk-typescript

```
Copyright 2023 Anthropic, PBC.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### @stablelib/base64 1.0.1

许可证：MIT · https://github.com/StableLib/stablelib/tree/master/packages/base64

```
This software is licensed under the MIT license:

Copyright (C) 2016 Dmitry Chestnykh

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### balanced-match 4.0.4

许可证：MIT · git://github.com/juliangruber/balanced-match.git

```
(MIT)

Original code Copyright Julian Gruber <julian@juliangruber.com>

Port to TypeScript Copyright Isaac Z. Schlueter <i@izs.me>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### brace-expansion 5.0.9

许可证：MIT · git+https://github.com/juliangruber/brace-expansion.git

```
MIT License

Copyright Julian Gruber <julian@juliangruber.com>

TypeScript port Copyright Isaac Z. Schlueter <i@izs.me>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### fast-sha256 1.3.0

许可证：Unlicense · https://github.com/dchest/fast-sha256-js

```
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org>
```

### minimatch 10.2.6

许可证：BlueOak-1.0.0 · git@github.com:isaacs/minimatch

```
# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with
this software as possible, while protecting contributors
from liability.

## Acceptance

In order to receive this license, you must agree to its
rules. The rules of this license are both obligations
under that agreement and conditions to your license.
You must not do anything with this software that triggers
a rule that you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this
software that would otherwise infringe that contributor's
copyright in it.

## Notices

You must ensure that everyone who gets a copy of
any part of this software from you, with or without
changes, also gets the text of this license or a link to
<https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not
complied with [Notices](#notices), you can keep your
license by taking all practical steps to comply within 30
days after the notice. If you do not do so, your license
ends immediately.

## Patent

Each contributor licenses you to do everything with this
software that would otherwise infringe any patent claims
they can license or become able to license.

## Reliability

No contributor can revoke this license.

## No Liability

**_As far as the law allows, this software comes as is,
without any warranty or condition, and no contributor
will be liable to anyone for any damages related to this
software or this license, under any kind of legal claim._**
```

### openai 7.17.0

许可证：Apache-2.0 · github:openai/openai-node

```
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2026 OpenAI

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### standardwebhooks 1.1.1

许可证：MIT · https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries/javascript

（包内没有许可证文件，以 package.json 的声明为准。）
<!-- bundled-packages:end -->
