package com.nutshop.content.fragment;

import com.nutshop.content.ContentReferenceService.Target;
import com.nutshop.content.fragment.CfDtos.RefSummary;
import com.nutshop.dam.AssetRenditions;
import com.nutshop.media.AssetTypes;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Names (and thumbnails) of referenced assets, fragments and products, by id, so editors can show what an id points
 * to (Content Fragments and Sites). Ids that no longer exist are left out.
 */
@Component
public class RefSummaries {

	private final JdbcTemplate jdbc;

	public RefSummaries(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public Map<String, RefSummary> of(Collection<Target> targets) {
		Map<String, RefSummary> refs = new LinkedHashMap<>();
		for (Target t : targets) {
			switch (t.type()) {
				case ASSET -> {
					UUID id = uuid(t.id());
					if (id != null) {
						jdbc.query("SELECT title, kind, url FROM dam_assets WHERE id = ?", rs -> {
							String thumb = AssetRenditions.url(rs.getString("url"), AssetTypes.Kind.valueOf(rs.getString("kind")),
									AssetRenditions.THUMB);
							refs.put(t.id(), new RefSummary(t.id(), "ASSET", rs.getString("title"), thumb, rs.getString("kind")));
						}, id);
					}
				}
				case FRAGMENT -> {
					UUID id = uuid(t.id());
					if (id != null) {
						jdbc.query("SELECT title, status FROM cf_fragments WHERE id = ?", rs -> {
							refs.put(t.id(), new RefSummary(t.id(), "FRAGMENT", rs.getString("title"), null, rs.getString("status")));
						}, id);
					}
				}
				case PRODUCT -> {
					try {
						jdbc.query("SELECT name, active FROM products WHERE id = ?", rs -> {
							refs.put(t.id(), new RefSummary(t.id(), "PRODUCT", rs.getString("name"), null,
									rs.getBoolean("active") ? "ACTIVE" : "HIDDEN"));
						}, Long.parseLong(t.id()));
					}
					catch (NumberFormatException ex) {
						// Not a product id: nothing to show
					}
				}
				default -> {
				}
			}
		}
		return refs;
	}

	private static UUID uuid(String raw) {
		try {
			return UUID.fromString(raw);
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}
}
