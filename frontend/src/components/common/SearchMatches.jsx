import Icon from "./Icon";

// Other places that matched a search, in case the best one was wrong
function SearchMatches({ search }) {
  if (search.otherMatches.length === 0) {
    return null;
  }

  return (
    <div className="search-matches">
      <div className="search-matches-title">
        <strong>Not the right place?</strong>

        <button
          type="button"
          aria-label="Close other matches"
          onClick={search.clearMatches}
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {search.otherMatches.map((match) => (
        <button
          type="button"
          key={`${match.lat},${match.lon}`}
          title={match.displayName}
          onClick={() => search.chooseMatch(match)}
        >
          {match.displayName}
        </button>
      ))}
    </div>
  );
}

export default SearchMatches;
