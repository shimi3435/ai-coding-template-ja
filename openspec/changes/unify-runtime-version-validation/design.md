# runtime判定の設計

## 合意した契約
バージョン本体はASCIIの `(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)`。
Node出力は `v`、npmは接頭辞なし、Python出力は `Python ` を要求する。
alpha / beta / RC / build metadataなど全suffixを拒否する。
末尾LFまたはCRLFは0個または1個だけ許可し、空白、空行、警告行、NUL等の混入を拒否する。

Node majorは24のみ。Pythonはmajor > 3、またはmajor = 3かつminor >= 14。
npmには新しい下限を設けない。数字は整数変換で丸めず、桁数と正規形文字列で比較する。
Bashの数字集合はrangeではなくASCII文字を明示列挙する。同長数値文字列の比較関数内だけ `local LC_ALL=C` とし、runtimeコマンドと後続setupへ呼出元localeをそのまま渡す。
巨大なmajor/minorにも算術overflowで合否を反転させない。通信・巨大出力の新しい資源制限は対象外。

versionコマンドは終了0を必須とし、stdoutだけを解析する。stderrの警告だけでは失敗しない。
コマンド不在、非0、spawn失敗は診断して停止する。doctorのruntime取得だけはraw stdoutを保持し、
他の助言コマンドの既存の結合出力・整形を変えない。Bashは末尾改行やNULを消す取得方法を避ける。

doctorはsys.version_infoの数値とreleaselevel / serialを参照して正式版のみ許容する。
sys.versionの先頭versionが数値3要素と一致することも確認し、releaselevelに現れない付加情報を拒否する。
sys.versionのコンパイラ情報をversion suffixとみなさない。Pythonコマンド出力の文法テストを
doctorの実プロセス検査へ偽装しない。共通fixtureに構造化version_infoを併記できるケースだけ、
doctor自身のPythonとの判定一致を検証する。

## 構造・検証seam
Bashはbootstrap内の小さな取得・形式判定関数、TypeScriptはruntime.ts、
Pythonはdoctor.pyのruntime診断を更新する。新しい外部runtime依存を作らない。
共通fixtureはtests/fixtures/runtime_versions.json。標準出力・標準エラー・終了コード・期待合否と、
該当時のPython構造化値を保持する。fixtureの期待値は仕様から明示し実装から計算しない。

bootstrapをfixture PATHで実行し、CLIは実Nodeからentrypoint.mjsを実行する。
doctorの公開診断関数を実fixtureコマンドと構造化Python値で実行する。
テストのためだけの公開CLIオプションを追加しない。共通fixtureは通常Node tests / pytestから読み、
削除予定のOpenSpecやGit履歴へ依存させない。
既存の失敗診断、dependency導入前のpreflight、導入処理前の停止も回帰確認する。

Cycle 2ではbootstrap共通fixtureをC / C.utf8と利用可能なen_US.UTF-8で実行する。
追加localeが未導入の場合だけその検証を理由付きskipし、新しいOS packageを通常checkへ要求しない。
今回の修正受け入れでは一時生成en_US.UTF-8をLOCPATHで参照して非C照合の成功を確認する。
LC_ALL指定とLANGだけの指定の両方で、runtimeコマンド・uv・taskに元のlocaleが渡ることを検証する。
CLIは実Nodeの絶対pathで起動し、PATHをfixtureだけに限定して各runtimeの実不在・実行権限なしを検証する。
既存のexit 127は起動済みprocessの失敗として別途保持する。

## spec-holes
以下は要件ごとの12分類の監査結果。未解決判断はない。
検証名「共通」はshared fixtureの各入口テスト、「既存」は既存preflight回帰テストを指す。

### R1: 正式版の文法と対応範囲
| # | 分類 | 判断 | 解決・検証 |
| --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 空stdoutを拒否。NoneはOS文字出力の型ではなく対象外。共通empty。 |
| 2 | 境界値 | 該当 | Node 23/24/25、Python 3.13/3.14/3.15/4、npm 0を明示。共通boundaries。 |
| 3 | 重複・衝突 | 該当 | 複数のversion行は拒否。共通multiple-lines。 |
| 4 | 順序 | 該当 | 警告が前後どちらでもstdoutへの混入を拒否。共通warnings。 |
| 5 | 型・形式不正 | 該当 | 接頭辞、suffix、不完全な3整数、符号を拒否。共通grammar。 |
| 6 | エラー経路 | 該当 | 解析不能と対象版外は失敗。共通と既存診断テスト。 |
| 7 | 冪等性・再実行 | 該当 | 同じ入力は同じ判定。共通fixtureの反復実行。 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない。 |
| 9 | 文字列 | 該当 | ASCII数字、末尾LF/CRLF各1つのみ。NUL、裸CR、空白、Unicode数字を拒否。共通encodingとlocale行列。 |
| 10 | 数値 | 該当 | NaN、inf、負数、先頭ゼロを拒否。比較で整数精度を失わない。共通numbersとlocale行列、比較関数のC固定。 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 大きな正規形整数も桁比較。共通large-integer。新しい出力quotaと永久hang保証は対象外。 |
| 12 | 状態遷移 | 非該当 | 形式判定は状態を持たない。 |

### R2: versionコマンドの取得と失敗
| # | 分類 | 判断 | 解決・検証 |
| --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | stderrだけのversionは拒否。共通stderr-only。 |
| 2 | 境界値 | 該当 | exit 0のみ受理、非0は拒否。共通nonzero。 |
| 3 | 重複・衝突 | 該当 | stdoutとstderrを連結しない。共通stderr-warning。 |
| 4 | 順序 | 該当 | bootstrapは全runtime成功後だけsetupへ進む。既存mutation test。 |
| 5 | 型・形式不正 | 該当 | stdoutの整形で形式違反を隠さない。共通whitespace。 |
| 6 | エラー経路 | 該当 | 不在・非0・spawn失敗を不合格にする。共通、既存missing test、CLIの3 executable × 2状態の実spawn失敗。 |
| 7 | 冪等性・再実行 | 該当 | 失敗時に環境を変更しない。既存mutation / filesystem test。 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻に依存しない。 |
| 9 | 文字列 | 該当 | raw stdoutの改行・制御文字を保持してR1を適用。共通encoding。 |
| 10 | 数値 | 該当 | 終了statusをversionの数値と混同しない。共通nonzero。 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 既存取得APIの資源上限・例外処理を尊重。新たなtimeout policyは対象外。 |
| 12 | 状態遷移 | 該当 | 失敗から導入処理へ進まない。既存mutation test。 |

### R3: 対象Pythonと入口間の一致
| # | 分類 | 判断 | 解決・検証 |
| --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | .python-version欠落は既存どおり不合格。doctor回帰。 |
| 2 | 境界値 | 該当 | 共通の構造化Python境界値でdoctorも検証する。共通python-info。 |
| 3 | 重複・衝突 | 該当 | PATHのPythonとdoctor自身は別対象として保持。doctor source test。 |
| 4 | 順序 | 非該当 | fixture順は期待合否に影響しない。 |
| 5 | 型・形式不正 | 該当 | doctorはOS提供のversion_infoを使う。存在しない構造化値の型保証は対象外。 |
| 6 | エラー経路 | 該当 | 各入口の失敗を成功へ置換しない。共通・既存。 |
| 7 | 冪等性・再実行 | 該当 | fixtureはread-only、テスト用PATHは一時領域へ隔離しcleanupする。localeは比較関数内だけ固定し、runtime / setupのLC_ALL・LANG継承を検証する。 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない。 |
| 9 | 文字列 | 該当 | doctorのreleaselevelがfinal以外なら拒否。alpha/beta/candidate共通fixture。 |
| 10 | 数値 | 該当 | Pythonの数値3要素とreleaselevel / serialを保持して検査。共通python-info。 |
| 11 | 巨大入力・リソース枯渇 | 非該当 | sys.version_infoはOSの固定構造。fixtureのサイズ最適化は対象外。 |
| 12 | 状態遷移 | 該当 | .python-version=3.14宣言と実行Pythonの最低版判定は別に維持。既存doctor test。 |

Cycle 2の12分類再監査: R1の文字列・数値、R2のエラー経路、R3の再実行を上記へ更新した。残る各分類の判断は維持し、未解決判断はない。
