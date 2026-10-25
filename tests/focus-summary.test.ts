/**
 * `src/ui/focus-summary.ts`（强制专注结束后的那一轮总结）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/focus-summary.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src \
 *   --outfile=/tmp/nota-测试/focus-summary.mjs
 * node /tmp/nota-测试/focus-summary.mjs
 * ```
 *
 * ⚠️ **要 `--alias:@=./src`**：被测模块 import 了 `@/ui/useForceFocus`（借它的
 * `说时长`）。漏了那个开关的报错是 `Could not resolve "…"`，看着不像"开关没给"。
 * ⚠️ **不需要** `--loader:.svg=text`（不碰那枚 SVG）——那一份只有 `share-card`
 * 要（`docs/06` §6.3）。
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-09-27）
 *
 * 用户当天提了「记得做一下专注模式结束后的总结功能就是将这一次专注模式的情况
 * 显示出来，并且像心电图那样也支持导出」。这一块**没有任何界面能替它验**：
 * 总结框要跑满一轮 5 秒以上才弹，而里面的数字对不对、曲线画成什么样，肉眼
 * 看不出来（一条余额曲线长得都差不多）。
 *
 * 所以这里钉的三件事，每一件都是"写错了也不会报错、只会悄悄给出一个错的总结"
 * 的那种：
 *
 * 1. **`记一笔` 的"同一秒就地更新"**——错了的话曲线的横轴密度是假的，
 *    而"多密"正是这条曲线要传达的东西（见那个函数的注释）；
 * 2. **`抽稀` 取余额大的那个**——取平均或取后一个会把"扣到底"那一下磨圆，
 *    而那个尖角是这张图唯一的信息；
 * 3. **`专注率` 的分母是专注＋离开**——算进警报冻住那一段的话，用户会因为
 *    "警报响了"而被扣分，而警报恰恰是他回来过的证据。
 *
 * # 测什么、不测什么
 *
 * - 测：采样、抽稀、总结、专注率、两个时刻函数、横刻度、分享卡字段；
 * - **不测**：`useFocusTrace` 那个 hook（它要 React 运行时与宿主事件，本仓没有
 *   jsdom）。"结束时抓的是最后一份**在跑**的快照"这条**靠的是读代码**
 *   ——那份文件头里写清了为什么，而这里能验的只有它调用的那几个纯函数。
 * - **不测**：卡片画出来好不好看（那是 `share-card.ts` 的事，`share-card.test.ts`
 *   已有一套）。
 */

import {
  adoptStyleLimit,
  mostShortTotalJoinSeconds,
  recordValueStroke,
  extractSparse,
  createTotalJoin,
  valueObtainTotalJoin,
  dedicatedNoteRate,
  sayTimeMoment,
  textItemTimeMoment,
  horizontalTick,
  createShareEnjoyCard,
  type AdoptStylePoint,
  type TotalJoin,
} from "../src/ui/focus-summary";
import { setLanguage } from "../src/i18n";
import type { FocusState } from "../src/bridge/types";

/* ── 极小的测试工装（与前几份同一套）─────────────────────────────────── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/** 造一份宿主快照。给的字段覆盖默认值（默认是"正在跑、余额 25 分钟"）。 */
function snapshot(change2: Partial<FocusState> = {}): FocusState {
  return {
    running: true,
    balance_ms: 25 * 60 * 1000,
    cap_ms: 25 * 60 * 1000,
    phase: "focusing",
    away_ms: 0,
    grace_ms: 10_000,
    elapsed_ms: 0,
    focused_ms: 0,
    away_total_ms: 0,
    alarms: 0,
    ...change2,
  };
}

/** 一秒一拍地喂 `n` 秒（余额从 `起` 开始每秒掉 1）——省得手写一串点。 */
function feed(secondsNumber: number, start4?: AdoptStylePoint[]): AdoptStylePoint[] {
  let output2 = start4 ?? [];
  for (let i = 1; i <= secondsNumber; i++) {
    output2 = recordValueStroke(output2, snapshot({ elapsed_ms: i * 1000, balance_ms: (25 * 60 - i) * 1000 }));
  }
  return output2;
}

/* ── 主 ─────────────────────────────────────────────────────────────── */

function main(): void {
  // ⚠️ **必须先定成中文**：`i18n` 的模块级初值是兜底 `"en"`（`i18n/index.ts`），
  // 不设的话下面那些断言文案的用例会拿到英文，而它们看起来会像"文案错了"。
  setLanguage("zh-CN");

  /* ── 1. 记一笔 ────────────────────────────────────────────────────── */
  group("记一笔");

  testCase("没在跑时不记（原样返回**同一个数组**，不触发重画）", () => {
    const emptyValue: AdoptStylePoint[] = [];
    const output2 = recordValueStroke(emptyValue, snapshot({ running: false }));
    // ⚠️ 断言的是**引用相等**而不是"长度 0"：每秒一次的事件路上，返回新数组
    // 就等于每秒一次 `setState`，而这一条正是"什么都没发生"的那条路。
    assertion(output2 === emptyValue, "应该是原样的那一个数组");
  });

  testCase("一轮结束后把序列清空（且给的是新数组）", () => {
    const oldValue = feed(3);
    equal(oldValue.length, 3, "先确认喂进去了");
    const output2 = recordValueStroke(oldValue, snapshot({ running: false }));
    equal(output2.length, 0, "结束那一刻要清空");
    assertion(output2 !== oldValue, "清空要给新数组（旧的那个还在别处被读着）");
  });

  testCase("正常一秒一拍：逐条追加", () => {
    const output2 = feed(3);
    equal(output2.length, 3, "三拍三个点");
    equal(output2[0]!.seconds, 1, "第一拍的秒数");
    equal(output2[2]!.seconds, 3, "最后一拍的秒数");
    equal(output2[0]!.balance, 25 * 60 - 1, "余额按秒记");
  });

  testCase("⚠️ 同一秒来两帧：就地更新，不追加", () => {
    let output2 = feed(1);
    output2 = recordValueStroke(output2, snapshot({ elapsed_ms: 1000, balance_ms: 5 * 1000 }));
    equal(output2.length, 1, "还是那一个点");
    equal(output2[0]!.balance, 5, "余额换成后到的那一份");
  });

  testCase("⚠️ 秒数倒退（乱序到达）也走就地更新，不留一个错位的点", () => {
    let output2 = feed(5);
    output2 = recordValueStroke(output2, snapshot({ elapsed_ms: 3000, balance_ms: 7 * 1000 }));
    equal(output2.length, 5, "不追加");
    equal(output2[4]!.seconds, 3, "末点的秒数被改写");
    equal(output2[4]!.balance, 7, "末点的余额被改写");
  });

  testCase("⚠️ 超过上限就抽稀（而不是丢掉最早那一段）", () => {
    const output2 = feed(adoptStyleLimit + 1);
    assertion(output2.length <= adoptStyleLimit, `长度该收在上限内，实际 ${output2.length}`);
    equal(output2.length, Math.ceil((adoptStyleLimit + 1) / 2), "整对整对合，长度减半");
    // ⚠️ 横轴仍然从第 1 秒起（丢最早那段的话这里会变成几秒之后）。
    equal(output2[0]!.seconds, 1, "最早那一段还在");
  });

  /* ── 2. 抽稀 ──────────────────────────────────────────────────────── */
  group("抽稀");

  testCase("⚠️ 相邻两点取**余额大的**那个（保住峰）", () => {
    const output2 = extractSparse([
      { seconds: 1, balance: 10 },
      { seconds: 2, balance: 5 },
    ]);
    equal(output2.length, 1, "两点合一点");
    equal(output2[0]!.balance, 10, "取大的那个（取平均会磨掉峰，取后一个会取到掉下来的那个）");
  });

  testCase("余额升上去的那一对取后一个", () => {
    const output2 = extractSparse([
      { seconds: 1, balance: 3 },
      { seconds: 2, balance: 9 },
    ]);
    equal(output2[0]!.balance, 9, "取大的那个");
  });

  testCase("⚠️ 单数的尾巴原样留着（丢掉的话横轴末尾会缺一小段）", () => {
    const output2 = extractSparse([
      { seconds: 1, balance: 3 },
      { seconds: 2, balance: 9 },
      { seconds: 3, balance: 4 },
    ]);
    equal(output2.length, 2, "合一个、留一个");
    equal(output2[1]!.seconds, 3, "尾巴还是最后一个点");
    equal(output2[1]!.balance, 4, "原样");
  });

  /* ── 3. 造总结 / 值得总结 / 专注率 ────────────────────────────────── */
  group("总结与专注率");

  testCase("⚠️ 时长兜到至少 1 秒（它要当除法的分母）", () => {
    const total = createTotalJoin(snapshot({ elapsed_ms: 0 }), []);
    equal(total.timeLengthSeconds, 1, "0 会让专注率变成 NaN");
  });

  testCase("负数读数被压成 0（浮点/顺序都可能让它探到负的）", () => {
    const total = createTotalJoin(snapshot({ focused_ms: -1, away_total_ms: -1 }), []);
    equal(total.dedicatedNoteSeconds, 0, "专注");
    equal(total.leaveOpenSeconds, 0, "离开");
  });

  testCase("毫秒取整成年/秒（四舍五入到最近的那一秒）", () => {
    const total = createTotalJoin(snapshot({ elapsed_ms: 1499, focused_ms: 1500 }), []);
    equal(total.timeLengthSeconds, 1, "1499 → 1");
    equal(total.dedicatedNoteSeconds, 2, "1500 → 2");
  });

  testCase("采样原样带进总结（不再复制一份）", () => {
    const point = feed(2);
    const total = createTotalJoin(snapshot(), point);
    assertion(total.adoptStyle === point, "同一个数组");
  });

  testCase(`⚠️ 短于 ${mostShortTotalJoinSeconds} 秒不值得弹（点错按钮不该收到一张卡）`, () => {
    equal(valueObtainTotalJoin(createTotalJoin(snapshot({ elapsed_ms: 4000 }), [])), false, "4 秒");
    equal(valueObtainTotalJoin(createTotalJoin(snapshot({ elapsed_ms: 5000 }), [])), true, "5 秒");
  });

  testCase("专注率：专注÷（专注＋离开），取整到百分数", () => {
    equal(dedicatedNoteRate(createTotalJoin(snapshot({ focused_ms: 60_000, away_total_ms: 40_000 }), [])), 60, "60/100");
  });

  testCase("⚠️ 两个都是 0 时返回 null（画破折号，**不是** 0%）", () => {
    equal(dedicatedNoteRate(createTotalJoin(snapshot({ focused_ms: 0, away_total_ms: 0 }), [])), null, "没数");
  });

  testCase("⚠️ 一次都没专注、但走开过：那是 0%（不是 null）", () => {
    equal(dedicatedNoteRate(createTotalJoin(snapshot({ focused_ms: 0, away_total_ms: 10_000 }), [])), 0, "真的 0%");
  });

  testCase("⚠️ 分母**不含**警报冻住的那一段", () => {
    // 专注 100 秒、离开 0 秒，但这一轮总共 200 秒（另外 100 秒在警报里冻着）。
    const total = createTotalJoin(
      snapshot({ elapsed_ms: 200_000, focused_ms: 100_000, away_total_ms: 0 }),
      [],
    );
    equal(dedicatedNoteRate(total), 100, "警报响着那段既不算专注也不算离开，不该拉低它");
  });

  /* ── 4. 说时刻 / 文件时刻 ────────────────────────────────────────── */
  group("两个时刻");

  const timeMoment = new Date(2026, 8, 27, 22, 7, 3);

  testCase("中文那一条是「2026年9月27日 22:07」（月日不补零，时分补）", () => {
    equal(sayTimeMoment(timeMoment), "2026年9月27日 22:07", "中文格式");
  });

  testCase("文件名里的时刻是纯 ASCII 的 20260927-2207", () => {
    const name3 = textItemTimeMoment(timeMoment);
    equal(name3, "20260927-2207", "形状");
    // ⚠️ 它要进文件系统：一个非 ASCII 字符就可能在某些文件系统上出问题。
    assertion(/^[\x20-\x7e]+$/.test(name3), "必须全是可打印 ASCII");
  });

  testCase("⚠️ 英文那条走的是**同一条格式串**，只是排布不同（ISO）", () => {
    setLanguage("en");
    try {
      equal(sayTimeMoment(timeMoment), "2026-9-27 22:07", "英文格式");
    } finally {
      // ⚠️ 一定要还原：下面的用例里还有断言中文文案的。
      setLanguage("zh-CN");
    }
  });

  /* ── 5. 横刻度 ────────────────────────────────────────────────────── */
  group("横刻度");

  testCase("一个点（或没有点）不给刻度——摆三档等于摆三个一样的数", () => {
    equal(horizontalTick([]).length, 0, "空序列");
    equal(horizontalTick([{ seconds: 1, balance: 3 }]).length, 0, "一个点");
  });

  testCase("两个点以上给三档：起、中、末，标签是时长不是序号", () => {
    const moment = horizontalTick([
      { seconds: 1, balance: 3 },
      { seconds: 30, balance: 2 },
      { seconds: 60, balance: 1 },
    ]);
    equal(moment.length, 3, "三档");
    equal(moment[0]!.at, 0, "第一档在最左");
    equal(moment[1]!.at, 0.5, "第二档在正中");
    equal(moment[2]!.at, 1, "第三档在最右");
    equal(moment[0]!.label, "0:00", "起点");
    equal(moment[1]!.label, "0:30", "中点按**末点的秒数**折半");
    equal(moment[2]!.label, "1:00", "末点");
  });

  /* ── 6. 造分享卡 ──────────────────────────────────────────────────── */
  group("造分享卡");

  /** 一份"标准"总结：总共 100 秒、专注 60、离开 40、响 2 次警报。 */
  function markAccurateTotalJoin(): TotalJoin {
    return createTotalJoin(
      snapshot({
        elapsed_ms: 100_000,
        focused_ms: 60_000,
        away_total_ms: 40_000,
        alarms: 2,
      }),
      feed(3),
    );
  }

  const card = createShareEnjoyCard(markAccurateTotalJoin(), timeMoment);

  testCase("⚠️ 大数字是**专注时长**，不是这一轮的总时长（那张卡要能拿去给人看）", () => {
    equal(card.value, "1:00", "专注 60 秒");
    equal(card.label, "这一轮专注了", "大数字上面那行");
  });

  testCase("三格是「本轮时长 / 专注占比 / 警报」", () => {
    equal(card.stats.length, 3, "三格");
    equal(card.stats[0]!.k, "本轮时长", "第一格的名字");
    equal(card.stats[0]!.v, "1:40", "第一格的数（100 秒）");
    equal(card.stats[1]!.k, "专注占比", "第二格");
    equal(card.stats[1]!.v, "60", "60/100");
    equal(card.stats[1]!.small, "%", "第二格的单位");
    equal(card.stats[2]!.k, "警报次数", "第三格");
    equal(card.stats[2]!.v, "2", "响了两次");
    // ⚠️ 单位**不许**回到 `small` 里：它是个裸字符串，英文那边会印出
    // `Alarm 1 times`（见 `focus-summary.ts` 那一段）。这条就是拦那个的。
    equal(card.stats[2]!.small, "", "单位在抬头里，不在这一格");
  });

  testCase("⚠️ 三格的抬头都是四字（并列的三格，长短不一看着像没对齐）", () => {
    for (const cell2 of card.stats) {
      equal(cell2.k.length, 4, `${cell2.k} 该是四字`);
    }
  });

  testCase("页脚说的是**离开**了多久", () => {
    equal(card.foot, "本轮离开时长为 0:40。", "离开 40 秒");
  });

  testCase("副标题不过 t()（与写作统计那张卡同一个口径）", () => {
    equal(card.subtitle, "Focus Session", "英文小字");
  });

  testCase("时刻与文件名", () => {
    equal(card.date, "2026年9月27日 22:07", "右上角");
    equal(card.file, "nota-focus-20260927-2207.png", "默认文件名");
  });

  testCase("曲线是余额那一列，序号与采样一一对应", () => {
    equal(card.points.length, 3, "三个点");
    equal(card.points[0], 25 * 60 - 1, "第一拍扣掉一秒的余额");
    equal(card.shape, "curve", "这条线是折线/曲线，不是热力图");
    equal(card.heat, null, "没有热力图");
    equal(card.less, "", "曲线图没有两端图例");
    equal(card.more, "", "同上");
  });

  testCase("刻度跟着采样走（三个点时才有）", () => {
    equal(card.xTicks.length, 3, "三档");
    equal(card.xMinor, 0, "不画次刻度");
  });

  testCase("⚠️ 采样为空时兜成一条平线（一个点画不出曲线）", () => {
    const emptyCard = createShareEnjoyCard(createTotalJoin(snapshot({ focused_ms: 1000 }), []), timeMoment);
    equal(emptyCard.points.length, 2, "补成两个点");
    equal(emptyCard.points[0], 0, "值是 0");
    equal(emptyCard.points[1], 0, "两个点一样（平线）");
  });

  testCase("⚠️ 采样只有一个点时也兜成两个点（否则刻度与纵轴范围一起退化）", () => {
    const valueCard = createShareEnjoyCard(
      createTotalJoin(snapshot({ focused_ms: 1000 }), [{ seconds: 1, balance: 42 }]),
      timeMoment,
    );
    equal(valueCard.points.length, 2, "补成两个点");
    equal(valueCard.points[0], 42, "两个点的值都是那一个点");
    equal(valueCard.points[1], 42, "同上");
  });

  testCase("⚠️ 专注率为 null 时那一格**留空**，不是写一个 0", () => {
    // 专注 0、离开 0：这一格没数。大数字仍需为正（时长兜到 1 秒）。
    const missingCount = createShareEnjoyCard(createTotalJoin(snapshot({ elapsed_ms: 6000 }), []), timeMoment);
    equal(missingCount.stats[1]!.v, "", "空着");
    equal(missingCount.stats[1]!.small, "", "单位也空着");
  });

  /* ── 收尾 ─────────────────────────────────────────────────────────── */

  console.log(`\n${"─".repeat(64)}`);
  console.log(`通过 ${pass} 条，失败 ${fail} 条`);
  if (fail) {
    console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
    process.exitCode = 1;
  }
}

main();
