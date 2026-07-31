/**
 * 内容库约定（路径、_res 等）
 * 扫盘逻辑见 scripts/scan-content.ts
 */
export default {
	/** 内容根目录（相对仓库根） */
	root: 'content',
	/**
	 * 资源目录：目录名 = prefix + name，比较时 name 大小写不敏感
	 * 例：_res / _Res / _RES
	 */
	resDirPrefix: '_',
	resDirName: 'res',
} as const;
