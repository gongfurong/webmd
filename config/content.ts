/**
 * 内容库约定（路径、资源目录等）
 * 扫盘逻辑见 scripts/lib/scan.ts → isResDirName
 */
export default {
	/** 内容根目录（相对仓库根） */
	root: 'content',
	/**
	 * 资源目录（不进树 / 不进上下页，仍可 /content 访问），忽略大小写：
	 * - 完整前缀 `_Res_`：如 `_Res_demo`、`_res_My.mp4`
	 * - 兼容旧名：恰好 `_res` / `_Res` / `_RES`
	 *
	 * 旁路资源夹（全站统一，与文件同级）：
	 *   `_Res_` + **完整文件名（含扩展名）**
	 *   foo.mp4   → _Res_foo.mp4/poster.jpg
	 *   bar.docx  → _Res_bar.docx/preview.pdf   （LibreOffice）
	 *   a.xlsx    → _Res_a.xlsx/Sheet1.csv      （SheetJS，不依赖 LO）
	 * 制作站点时生成；已有不覆盖。旧名 `_Res_foo` 仅兼容查找。
	 */
	resDirPrefix: '_Res_',
} as const;
