package com.nutshop.product;

import jakarta.persistence.*;

@Entity
@Table(name = "categories")
public class Category {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false, unique = true)
	private String slug;

	protected Category() {
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getSlug() {
		return slug;
	}
}
