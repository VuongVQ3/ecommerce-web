package com.nutshop.dam;

import com.nutshop.media.AssetTypes.Kind;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Sized versions of an asset, made by Cloudinary from the URL (nothing extra is stored): the transformation goes
 * right after "/upload/". A PDF gets pictures of its first page (thumb and card only, as .jpg).
 */
public final class AssetRenditions {

	public static final String THUMB = "thumb";
	public static final String CARD = "card";
	public static final String HERO = "hero";
	public static final String OG = "og";

	/** Preset → transformation, in the order the author sees them. */
	static final Map<String, String> PRESETS = presets();

	private static final String UPLOAD = "/upload/";

	private AssetRenditions() {
	}

	private static Map<String, String> presets() {
		Map<String, String> presets = new LinkedHashMap<>();
		presets.put(THUMB, "w_240,h_240,c_fill,f_auto,q_auto");
		presets.put(CARD, "w_600,c_limit,f_auto,q_auto");
		presets.put(HERO, "w_1600,c_limit,f_auto,q_auto");
		presets.put(OG, "w_1200,h_630,c_fill,f_jpg,q_auto");
		return Collections.unmodifiableMap(presets);
	}

	/** Every rendition of the asset: thumb, card, hero, og for an image; thumb and card for a PDF. */
	public static Map<String, String> of(String url, Kind kind) {
		Map<String, String> renditions = new LinkedHashMap<>();
		if (kind == Kind.PDF) {
			renditions.put(THUMB, url(url, kind, THUMB));
			renditions.put(CARD, url(url, kind, CARD));
		}
		else {
			PRESETS.keySet().forEach(preset -> renditions.put(preset, url(url, kind, preset)));
		}
		return renditions;
	}

	/**
	 * One rendition. A URL that is not a Cloudinary delivery URL (no "/upload/") is returned as it is. For a PDF the
	 * transformation starts with pg_1 and the extension becomes .jpg.
	 */
	public static String url(String url, Kind kind, String preset) {
		String transformation = PRESETS.get(preset);
		if (transformation == null) {
			throw new IllegalArgumentException("Unknown rendition: " + preset);
		}
		int at = url == null ? -1 : url.indexOf(UPLOAD);
		if (at < 0) {
			return url;
		}
		String rest = url.substring(at + UPLOAD.length());
		if (kind == Kind.PDF) {
			transformation = "pg_1," + transformation;
			int dot = rest.lastIndexOf('.');
			int slash = rest.lastIndexOf('/');
			rest = (dot > slash ? rest.substring(0, dot) : rest) + ".jpg";
		}
		return url.substring(0, at + UPLOAD.length()) + transformation + "/" + rest;
	}
}
