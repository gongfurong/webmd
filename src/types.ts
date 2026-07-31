/** 导航树节点（与 scripts/scan-content 输出一致） */
export type FileKind = 'markdown' | 'text' | 'image' | 'video' | 'audio' | 'pdf' | 'file';

export type TreeFile = {
	type: 'file';
	name: string;
	path: string;
	ext: string;
	kind: FileKind;
	url: string;
};

export type TreeDir = {
	type: 'dir';
	name: string;
	path: string;
	children: TreeNode[];
};

export type TreeNode = TreeFile | TreeDir;

export type TreeJson = {
	generatedAt: string;
	root: string;
	children: TreeNode[];
};
