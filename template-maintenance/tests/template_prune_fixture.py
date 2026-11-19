"""詳細回帰用corpusと、共通repository fixtureへの接続。"""

import importlib
import json
import sys
from pathlib import Path

from prune_corpus import validate_cases

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests"))
common = importlib.import_module("downstream_repository_fixture")
ASSETS = common.ASSETS
KEPT = common.KEPT
inspect = common.inspect
plan = common.plan
git = common.git
commit_fixture = common.commit_fixture
copy_runtime = common.copy_runtime
CORPUS = "template-maintenance/fixtures/prune/references.json"
CASES = json.loads((ROOT / CORPUS).read_text())
validate_cases(CASES)


def fixture(root: Path, bundled=True) -> Path:
    common.fixture(root, bundled)
    if bundled:
        (root / CORPUS).write_text(json.dumps(CASES))
    return root


def install_runtime_bundles(root: Path, names: tuple[str, ...]) -> None:
    """取得物を実行せず、共通decoderで扱うsynthetic bundleを配置する。"""
    import subprocess

    script = r"""
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {runtimeSource,runtimeLock,bundleFiles}
 from './repo-tools/skill-updater-bundle-test-fixture.ts';
import {readRepositorySkillState} from './repo-tools/skill-updater/repository.ts';
import {serializeSources,serializeLock} from './repo-tools/skill-updater/schema.ts';
const root=process.cwd();const names=JSON.parse(process.argv[1]);
const state=readRepositorySkillState(root);
for(const name of names)for(const file of bundleFiles){
 const path=join(root,'.agents/vendor',name,file.path);
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path,file.content,{mode:file.executable?0o755:0o644});
}
writeFileSync('.agents/skills/skills.sources.json',serializeSources({...state.sources,skills:[...state.sources.skills,...names.map(name=>runtimeSource(name))]}));
writeFileSync('.agents/skills/skills.lock.json',serializeLock({...state.lock,skills:[...state.lock.skills,...names.map(name=>runtimeLock(runtimeSource(name)))]}));
"""
    subprocess.run(
        ["node", "--input-type=module", "-e", script, json.dumps(names)],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )


def retire_runtime_bundle(root: Path, name: str) -> None:
    """自作fixtureのsource・lock・実体だけを同じ変更で撤去する。"""
    import shutil

    for filename in ("skills.sources.json", "skills.lock.json"):
        path = root / ".agents/skills" / filename
        value = json.loads(path.read_text())
        value["skills"] = [s for s in value["skills"] if s["name"] != name]
        path.write_text(json.dumps(value, indent=2) + "\n")
    shutil.rmtree(root / ".agents/vendor" / name)
