package com.nutshop.content.site;

import com.nutshop.content.fragment.FragmentValidator;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Optional;
import java.util.UUID;

/**
 * {@link PageValidator.Lookup} against the database: the fragment lookups plus categories and models. Not a bean
 * (it would be a second FragmentValidator.Lookup); SitePageService builds it.
 */
final class JdbcPageLookup implements PageValidator.Lookup {

	private final FragmentValidator.Lookup fragments;
	private final JdbcTemplate jdbc;

	JdbcPageLookup(FragmentValidator.Lookup fragments, JdbcTemplate jdbc) {
		this.fragments = fragments;
		this.jdbc = jdbc;
	}

	@Override
	public Optional<String> assetKind(UUID id) {
		return fragments.assetKind(id);
	}

	@Override
	public Optional<String> fragmentModel(UUID id) {
		return fragments.fragmentModel(id);
	}

	@Override
	public boolean productExists(long id) {
		return fragments.productExists(id);
	}

	@Override
	public boolean categoryExists(String slug) {
		return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM categories WHERE slug = ?)", Boolean.class, slug));
	}

	@Override
	public boolean modelExists(String slug) {
		return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM cf_models WHERE slug = ?)", Boolean.class, slug));
	}
}
