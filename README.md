# @lingyun_jaya/dsh-bot-team

DeepSeek Harness 的 Bot Team 插件：在左侧栏打开 Bot 页面，创建有名字、有岗位、长期在线的 AI 同事。

- 每个 Bot 有自己的对话、记忆、私有技能和 Routine（定时 / 事件触发）
- Bot 之间用交接（handoff）分派工作，结果自动回给发起方，可附带图片和文件产物
- 群聊：多个 Bot 加一位协调者，`@Bot` / `@everyone` 直接转交；任务进行中再 @ 一次就是插话跟进
- 共享工作区与共享技能目录，所有 Bot 共用

## 要求

DeepSeek Harness 桌面端 `0.2.1-rc.5` 及以上、`0.3` 以下。

## 安装

先 **Cmd+Q 完全退出 DeepSeek Harness**，然后在终端运行：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add @lingyun_jaya/dsh-bot-team
```

再打开 DeepSeek Harness，左侧栏会出现 Bot 入口。

- 请使用上面这条完整路径：系统 `PATH` 里的 `dsh` 可能是旧版本。
- 桌面端的 profile 默认叫 `desktop`；改过名的话，把命令里的 `desktop` 换掉。

## 升级与卸载

同样先退出 DeepSeek Harness：

```bash
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add @lingyun_jaya/dsh-bot-team@latest   # 升级
"$DSH" plugin --profile desktop remove @lingyun_jaya/dsh-bot-team       # 卸载
```

卸载不会删除数据。Bot、记忆和交接记录保存在 `~/.dsh/bot-team/`，不再需要时可手动删除。

## 进度与唤醒

成员的进度不会打断发起方，发起方下次运行时一并看到；只有最终交付、阻塞（`blocked: true`）和回答催问的回复才会唤醒它。想知道进行中的工作到哪了，在群里问一句即可，协调者会转为跟进送达负责人。

## 交接跳数上限

每次交接、跟进或回复都算一跳，同一条链路累计超过上限时不再投递，防止 Bot 之间自动互回形成死循环。默认上限 20 跳，大约够两个成员往返 9 轮。

- 用户在某个 Bot 的对话里直接发一句话，这个 Bot 的跳数就会清零，可以接着协作。
- 要调整上限，在 `~/.dsh/profiles/desktop/cordis.patch.yml` 里加一项，`maxHops` 必须是大于等于 1 的整数，然后重启 DeepSeek Harness：

```yaml
- id: dsh-bot-team
  name: "@lingyun_jaya/dsh-bot-team"
  config:
    maxHops: 30
```

## 许可证

Apache-2.0
