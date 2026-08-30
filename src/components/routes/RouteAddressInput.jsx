import { useEffect, useState } from "react";

export function RouteAddressInput({
  value,
  onChange,
  placeholder = "Search Cyprus address",
}) {
  const [touched, setTouched] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!touched) {
      return;
    }

    const query = String(value?.address || "").trim();

    if (query.length < 2) {
      setSuggestions([]);
      setError("");
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/address-search?q=${encodeURIComponent(query)}`
        );

        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error ||
              "Unable to load address suggestions."
          );
        }

        if (cancelled) {
          return;
        }

        setSuggestions(payload.suggestions || []);

        if (!payload.suggestions?.length) {
          setError(
            payload.warning ||
              "No Cyprus address suggestions found."
          );
        }
      } catch (searchError) {
        if (cancelled) {
          return;
        }

        setSuggestions([]);
        setError(
          searchError.message ||
            "Unable to load address suggestions."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [touched, value?.address]);

  function updateAddress(event) {
    setTouched(true);
    setError("");

    onChange({
      ...value,
      address: event.target.value,
      latitude: "",
      longitude: "",
    });
  }

  async function selectSuggestion(suggestion) {
    setLoading(true);
    setError("");

    try {
      let latitude = normalizeCoordinate(
        suggestion.latitude
      );

      let longitude = normalizeCoordinate(
        suggestion.longitude
      );

      let address =
        suggestion.fullAddress ||
        suggestion.address ||
        suggestion.label ||
        "";

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        const response = await fetch(
          "/api/address-geocode",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              address,
              placeId: suggestion.placeId || "",
            }),
          }
        );

        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error ||
              "Unable to geocode selected address."
          );
        }

        latitude = normalizeCoordinate(payload.latitude);
        longitude = normalizeCoordinate(payload.longitude);

        address =
          payload.formattedAddress ||
          payload.address ||
          address;
      }

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        throw new Error(
          "The selected address does not have valid coordinates."
        );
      }

      onChange({
        ...value,
        address,
        latitude,
        longitude,
      });

      setSuggestions([]);
      setTouched(false);
    } catch (selectionError) {
      setError(
        selectionError.message ||
          "Unable to use selected address."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="address-autocomplete">
      <input
        value={value?.address || ""}
        onChange={updateAddress}
        placeholder={placeholder}
        autoComplete="off"
      />

      {loading ? (
        <span className="address-loading">
          Searching Cyprus addresses...
        </span>
      ) : null}

      {error ? (
        <span className="address-error">{error}</span>
      ) : null}

      {suggestions.length ? (
        <div
          className="address-suggestions"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={
                suggestion.id ||
                suggestion.placeId ||
                `${suggestion.label}-${index}`
              }
              type="button"
              onClick={() =>
                selectSuggestion(suggestion)
              }
            >
              <strong>
                {suggestion.mainLine ||
                  suggestion.label}
              </strong>

              <span>
                {suggestion.secondaryLine ||
                  "Area not available"}
              </span>

              <small>
                {suggestion.isCoordinateLocation
                  ? "Coordinates"
                  : suggestion.latitude && suggestion.longitude
                    ? "Coordinates available"
                    : "Coordinates will be resolved after selection"}
              </small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function normalizeCoordinate(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : null;
}