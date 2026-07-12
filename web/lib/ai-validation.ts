export type TextTransformItem = {
  id: number;
  text: string;
};

export function isValidTextTransform(
  source: TextTransformItem[],
  output: unknown,
): output is TextTransformItem[] {
  return (
    Array.isArray(output) &&
    output.length === source.length &&
    output.every(
      (item, index) =>
        item &&
        typeof item === "object" &&
        "id" in item &&
        "text" in item &&
        item.id === source[index].id &&
        typeof item.text === "string" &&
        item.text.split("\n").length === source[index].text.split("\n").length,
    )
  );
}
