# 🐟 fish
> 你的 Git 提交记录，比老板更懂你。

一个基于 Git Commit 的程序员画像生成器。
分析摸鱼指数、爆肝程度、修仙记录和开发习惯，
并生成令人会心一笑的 AI 风格锐评。

分析你的：

🐟 摸鱼程度  
🔥 爆肝程度  
🌙 修仙程度  
🧱 搬砖程度  
💥 梭哈程度

并解锁：

🏷 摸鱼宗师  
🏷 爆肝战神  
🏷 深夜修仙者  
🏷 PPT 架构师  
🏷 Git 聊天达人

因为：

> 每一条 Commit，都是程序员留下的生活痕迹。

配置/新增 GitLab 远程扫描源（支持多数据源管理）：
  ```bash
  fish config gitlab <token> [host] [name]
  ```
  * `token`: 你的 GitLab 个人/项目访问令牌 (PAT)，需有 `read_api` 或 `api` 权限。
  * `host`: 可选。私有部署的 GitLab 域名（如 `https://gitlab.mycompany.com`），缺省默认使用 `https://gitlab.com`。
  * `name`: 可选。给该数据源指定的别名（如 `my-company`），缺省时自动使用 host 域名作为别名。若别名已存在则会覆盖更新。
