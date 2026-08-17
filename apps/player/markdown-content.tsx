import { parseMarkdown, type MarkdownInline } from "@duna/core";
import {
  Linking,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { FellixText as Text } from "./fellix-text";

function InlineMarkdown({
  nodes,
  textStyle,
  linkColor,
}: {
  readonly nodes: readonly MarkdownInline[];
  readonly textStyle: TextStyle;
  readonly linkColor: string;
}) {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.value;
    if (node.type === "code") {
      return (
        <Text key={index} style={[styles.code, { color: textStyle.color }]}>
          {node.value}
        </Text>
      );
    }
    if (node.type === "strong") {
      return (
        <Text key={index} style={styles.strong}>
          <InlineMarkdown
            linkColor={linkColor}
            nodes={node.children}
            textStyle={textStyle}
          />
        </Text>
      );
    }
    if (node.type === "emphasis") {
      return (
        <Text key={index} style={styles.emphasis}>
          <InlineMarkdown
            linkColor={linkColor}
            nodes={node.children}
            textStyle={textStyle}
          />
        </Text>
      );
    }
    return (
      <Text
        accessibilityRole="link"
        key={index}
        onPress={() => void Linking.openURL(node.href)}
        style={[styles.link, { color: linkColor }]}
      >
        <InlineMarkdown
          linkColor={linkColor}
          nodes={node.children}
          textStyle={textStyle}
        />
      </Text>
    );
  });
}

export function NativeMarkdownContent({
  color,
  linkColor = color,
  markdown,
  style,
}: {
  readonly color: string;
  readonly linkColor?: string;
  readonly markdown: string;
  readonly style?: ViewStyle;
}) {
  const textStyle: TextStyle = { color, fontSize: 15, lineHeight: 23 };
  return (
    <View style={[styles.document, style]}>
      {parseMarkdown(markdown).map((block, index) => {
        if (block.type === "heading") {
          const headingStyle =
            block.level === 1
              ? styles.headingOne
              : block.level === 2
                ? styles.headingTwo
                : styles.headingThree;
          return (
            <Text key={index} style={[headingStyle, { color }]}>
              <InlineMarkdown
                linkColor={linkColor}
                nodes={block.children}
                textStyle={textStyle}
              />
            </Text>
          );
        }
        if (block.type === "list") {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listItem}>
                  <Text style={[styles.bullet, { color }]}>
                    {block.ordered ? `${itemIndex + 1}.` : "•"}
                  </Text>
                  <Text style={[styles.listText, textStyle]}>
                    <InlineMarkdown
                      linkColor={linkColor}
                      nodes={item}
                      textStyle={textStyle}
                    />
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === "quote") {
          return (
            <View
              key={index}
              style={[styles.quote, { borderLeftColor: linkColor }]}
            >
              <Text style={[styles.quoteText, textStyle]}>
                <InlineMarkdown
                  linkColor={linkColor}
                  nodes={block.children}
                  textStyle={textStyle}
                />
              </Text>
            </View>
          );
        }
        if (block.type === "rule")
          return <View key={index} style={styles.rule} />;
        return (
          <Text key={index} style={[styles.paragraph, textStyle]}>
            <InlineMarkdown
              linkColor={linkColor}
              nodes={block.children}
              textStyle={textStyle}
            />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: { fontSize: 15, lineHeight: 23, width: 18 },
  code: {
    backgroundColor: "rgba(0, 0, 0, 0.08)",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 13,
    paddingHorizontal: 3,
  },
  document: { gap: 0 },
  emphasis: { fontStyle: "italic" },
  headingOne: {
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
    marginBottom: 10,
    marginTop: 8,
  },
  headingTwo: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26,
    marginBottom: 8,
    marginTop: 7,
  },
  headingThree: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
    marginBottom: 7,
    marginTop: 6,
  },
  link: { textDecorationLine: "underline" },
  list: { gap: 5, marginBottom: 13 },
  listItem: { alignItems: "flex-start", flexDirection: "row" },
  listText: { flex: 1 },
  paragraph: { marginBottom: 13 },
  quote: { borderLeftWidth: 3, marginBottom: 13, paddingLeft: 11 },
  quoteText: { fontStyle: "italic" },
  rule: {
    backgroundColor: "rgba(0, 0, 0, 0.14)",
    height: 1,
    marginBottom: 15,
    marginTop: 3,
  },
  strong: { fontWeight: "800" },
});
