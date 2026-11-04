import Icon from "../common/Icon";

function SuggestHeader({ search, onBack }) {
  return (
    <header className="suggest-road-header">

      <button
        type="button"
        className="suggest-back-button"
        onClick={onBack}
      >
        <Icon name="back" size={18} />
        Back
      </button>

      <div className="suggest-road-heading">

        <div className="suggest-road-title">
          Suggest a narrow road
        </div>

        <div className="suggest-road-subtitle">
          Help other drivers stay safe
        </div>

      </div>

      <div className="suggest-header-search-container">
        <div className="suggest-header-search">
          <span className="suggest-search-icon"><Icon name="search" size={18} /></span>
          <input
            type="text"
            value={search.searchText}
            onChange={(event) =>
              search.setSearchText(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();

                search.searchLocationOnMap();
              }
            }}
            placeholder="Search location..."
          />
        </div>

        <button
          type="button"
          onClick={search.searchLocationOnMap}
          disabled={search.searching}
          className="suggest-search-btn"
        >
          {search.searching ? "Searching…" : "Search"}
        </button>
      </div>

    </header>
  );
}

export default SuggestHeader;
