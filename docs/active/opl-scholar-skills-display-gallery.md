# MAS Scholar Skills Display Gallery

Owner: `One Person Lab`
Purpose: `human_review_entry_for_scholar_display_capability`
State: `active_support`
Machine boundary: 本文是 Scholar Display 的人读审阅入口。Gallery artifact truth 归 MAS Display Pack；ScholarSkills 只引用 MAS-owned review refs，不复制、不改写、不授权 publication readiness。

## 定位

`mas-scholar-skills.display` 复用 MAS Display Pack 作为当前人审 gallery。它的职责是让 MAS 或其他 OPL family agent 在调用 Scholar Display 前，能快速看到默认图件风格、模板覆盖、renderer policy、quality gate 和已知边界。

Gallery 只能证明有人可审的可视样例和 manifest surface 存在；它不能证明真实论文 figure ready、visual parity 完成、owner accepted、publication ready、current package ready 或 artifact authority。
These refs do not prove publication readiness.

## 人审入口

当前 canonical gallery refs 由 MAS repo 持有：

- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery.pdf`
- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery_reference.md`
- `med-autoscience/docs/delivery/medical-display/examples/display_pack_gallery_status.md`
- `med-autoscience/docs/delivery/medical-display/examples/display_pack_gallery_quality_audit.md`
- `med-autoscience/docs/delivery/medical-display/examples/gallery_manifest.json`
- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery_assets/gallery_manifest.json`

Fresh readback 口径：

- Gallery status、template count、renderer policy、style profile、palette ref 和 audit finding 都从 MAS-owned gallery status / manifest / quality audit 读取。
- OPL active doc 只冻结 ref 位置、owner boundary 和维护命令，不冻结高漂移 audit 数字。
- Publication-ready / figure-ready / current-package-ready claim 必须由 MAS owner gate 或 typed blocker 关闭；gallery rendered、manifest present、audit clean 或 MAS Scholar Skills ref observed 都不能授权这些 claim。

## Scholar Display 调用边界

ScholarSkills 输出的 `visual_audit_or_gallery_preview_ref` 应指向上述 MAS-owned gallery surface 或由 domain owner 接受的后续 gallery/ref。该 ref 是 review hint，不是 artifact body authority。

调用链仍保持：

```text
MAS Scholar Skills display descriptor
  -> candidate display refs / execution receipt candidate
  -> MAS owner-consumption readback
  -> MAS owner gate accept / reject / route back
```

只有 MAS owner gate 才能把具体 figure、visual audit receipt、route-back 或 blocker 纳入论文 truth。Scholar Display gallery 不写 MAS domain truth、owner receipt、typed blocker、runtime queue、publication eval、controller decision、current package 或 paper artifact body。

## 维护命令

MAS gallery 资产更新仍在 MAS repo 执行：

```bash
cd /Users/gaofeng/workspace/med-autoscience
./scripts/run-python-clean.sh scripts/build-display-pack-gallery.py --publish-docs
```

只需要重打包已存在 docs mirror 时：

```bash
cd /Users/gaofeng/workspace/med-autoscience
./scripts/run-python-clean.sh scripts/build-display-pack-gallery.py --publish-docs --package-only
```

MAS Scholar Skills 文档只能引用这些 refs 和 fresh readback；不要在 OPL repo 复制 gallery assets，也不要把 MAS gallery manifest 当成 OPL-owned truth。
