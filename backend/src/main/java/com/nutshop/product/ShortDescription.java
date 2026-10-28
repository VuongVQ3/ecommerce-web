package com.nutshop.product;

import java.util.ArrayList;
import java.util.List;

/**
 * The short description shown in the quick view, search snippets and &lt;meta name="description"&gt;: the one typed
 * in the back office, or else one derived from the full description (never stored, so it follows later edits).
 */
public final class ShortDescription {

	/** Longest short description, typed or derived (the column is varchar(160)) */
	public static final int MAX = 160;

	private ShortDescription() {
	}

	/** What the storefront shows: the typed one, or the first paragraph of the description cut to {@link #MAX}. */
	public static String of(Product p) {
		return p.getShortDescription() != null ? p.getShortDescription() : fromDescription(p.getDescription());
	}

	/**
	 * The first paragraph of a description as the storefront shows it (see the frontend's parseDescription):
	 * sections are separated by blank lines; in a section of two lines or more the first line is a heading and is
	 * skipped; text without any blank line is one paragraph (line breaks read as spaces). Cut to {@link #MAX}
	 * characters at a word boundary, with "…". Null when the description is blank.
	 */
	public static String fromDescription(String description) {
		List<List<String>> blocks = new ArrayList<>();
		blocks.add(new ArrayList<>());
		for (String raw : (description == null ? "" : description).split("\\r\\n?|\\n", -1)) {
			String line = raw.replaceAll("\\s+", " ").strip();
			if (!line.isEmpty()) {
				blocks.getLast().add(line);
			} else if (!blocks.getLast().isEmpty()) {
				blocks.add(new ArrayList<>());
			}
		}
		blocks.removeIf(List::isEmpty);
		if (blocks.isEmpty()) {
			return null;
		}
		List<String> first = blocks.getFirst();
		String paragraph = blocks.size() == 1 ? String.join(" ", first) : first.get(first.size() == 1 ? 0 : 1);
		return cut(paragraph);
	}

	/** At most {@link #MAX} characters, "…" included, cut at the last space (mid-word only for one huge word). */
	static String cut(String text) {
		if (text.length() <= MAX) {
			return text;
		}
		String head = text.substring(0, MAX - 1);
		if (!Character.isWhitespace(text.charAt(MAX - 1))) {
			int space = head.lastIndexOf(' ');
			if (space > 0) {
				head = head.substring(0, space);
			} else if (Character.isHighSurrogate(head.charAt(head.length() - 1))) {
				head = head.substring(0, head.length() - 1);
			}
		}
		return head.replaceAll("[\\s,.;:–-]+$", "") + "…";
	}
}
