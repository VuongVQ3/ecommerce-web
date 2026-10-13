package com.nutshop.address;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Vietnam's administrative units since the 2025-07-01 reform: 34 provinces/cities, each with its wards/communes
 * (the district level no longer exists). Same file as the frontend's src/data/vn-admin-units.json; a test keeps
 * the two copies identical. Lets the server turn the codes chosen in the form into canonical names.
 */
@Component
public class AdminUnits {

	/** Canonical names for a province + ward pair. */
	public record Address(String province, String ward) {
	}

	record WardFile(String source, String fetchedAt, List<ProvinceEntry> provinces) {
	}

	record ProvinceEntry(int code, String name, List<List<Object>> wards) {
	}

	private record Province(String name, Map<Integer, String> wards) {
	}

	private final Map<Integer, Province> provinces = new HashMap<>();

	public AdminUnits(JsonMapper json) {
		try (InputStream in = new ClassPathResource("vn-admin-units.json").getInputStream()) {
			WardFile file = json.readValue(in, WardFile.class);
			for (ProvinceEntry p : file.provinces()) {
				Map<Integer, String> wards = new HashMap<>();
				for (List<Object> w : p.wards()) {
					wards.put(((Number) w.get(0)).intValue(), (String) w.get(1));
				}
				provinces.put(p.code(), new Province(p.name(), wards));
			}
		}
		catch (IOException ex) {
			throw new UncheckedIOException("Cannot load vn-admin-units.json", ex);
		}
	}

	/** Empty when the province does not exist or the ward does not belong to it. */
	public Optional<Address> resolve(int provinceCode, int wardCode) {
		Province province = provinces.get(provinceCode);
		if (province == null || !province.wards().containsKey(wardCode)) {
			return Optional.empty();
		}
		return Optional.of(new Address(province.name(), province.wards().get(wardCode)));
	}

	public int provinceCount() {
		return provinces.size();
	}
}
