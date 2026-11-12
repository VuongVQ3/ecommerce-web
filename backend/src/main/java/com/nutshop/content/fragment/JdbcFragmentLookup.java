package com.nutshop.content.fragment;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/** {@link FragmentValidator.Lookup} against the database. */
@Component
class JdbcFragmentLookup implements FragmentValidator.Lookup {

	private final JdbcTemplate jdbc;

	JdbcFragmentLookup(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<String> assetKind(UUID id) {
		return jdbc.queryForList("SELECT kind FROM dam_assets WHERE id = ?", String.class, id).stream().findFirst();
	}

	@Override
	public Optional<String> fragmentModel(UUID id) {
		return jdbc.queryForList("SELECT m.slug FROM cf_fragments f JOIN cf_models m ON m.id = f.model_id WHERE f.id = ?",
				String.class, id).stream().findFirst();
	}

	@Override
	public boolean productExists(long id) {
		return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM products WHERE id = ?)", Boolean.class, id));
	}
}
