






























































import { $remark } from "@milkdown/kit/utils";


interface MdastNode {
  type?: string;
  alt?: string | null;
  title?: string | null;
  children?: MdastNode[];
}


function eraseRemoveImageSliceOfEmptyAttribute(node: MdastNode): void {
  if (node.type === "image") {
    if (node.alt === null || node.alt === undefined) node.alt = "";
    if (node.title === null || node.title === undefined) node.title = "";
  }


  if (Array.isArray(node.children)) {
    for (const child of node.children) eraseRemoveImageSliceOfEmptyAttribute(child);
  }
}





export const fillAllImageSliceAttribute = $remark("nota-image-attrs", () => () => (tree: MdastNode) => {
  eraseRemoveImageSliceOfEmptyAttribute(tree);
});
