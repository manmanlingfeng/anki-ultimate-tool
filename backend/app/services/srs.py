"""
Anki SM-2 Spaced Repetition Algorithm Implementation

Matches Anki's exact SRS calculations for review cards.
Reference: https://juliensobczak.com/inspect/2022/05/30/anki-srs/
"""
import random
from datetime import datetime, timedelta


def calculate_next_review(
    interval: int,
    factor: int,
    days_overdue: int,
    ease: int
) -> tuple[int, int]:
    """
    Calculate next interval and ease factor after answering a card.

    Args:
        interval: Current interval in days
        factor: Current ease factor (2500 = 250%)
        days_overdue: Days since card was due (0 if on time, positive if late)
        ease: Answer quality (1=Again, 2=Hard, 3=Good, 4=Easy)

    Returns:
        tuple of (new_interval_days, new_factor)
    """
    if ease == 1:  # Again - failed
        new_ivl = 1
        new_factor = max(1300, factor - 200)

    elif ease == 2:  # Hard
        # Hard factor is 1.2
        new_ivl = max(interval + 1, int(interval * 1.2))
        new_factor = max(1300, factor - 150)

    elif ease == 3:  # Good
        # Good uses the ease factor with half the overdue bonus
        delay_bonus = days_overdue // 2
        new_ivl = max(interval + 1, int((interval + delay_bonus) * factor / 1000))
        new_factor = factor

    else:  # ease == 4, Easy
        # Easy gets full overdue bonus plus easy bonus (1.3)
        delay_bonus = days_overdue
        new_ivl = max(interval + 1, int((interval + delay_bonus) * factor / 1000 * 1.3))
        new_factor = min(factor + 150, 3000)  # Cap at 300%

    # Apply fuzz factor to prevent clustering
    new_ivl = apply_fuzz(new_ivl)

    # Cap at maximum interval (100 years)
    new_ivl = min(new_ivl, 36500)

    return new_ivl, new_factor


def apply_fuzz(interval: int) -> int:
    """
    Add random variation to interval to prevent card clustering.

    Args:
        interval: Base interval in days

    Returns:
        Interval with random fuzz applied
    """
    if interval < 2:
        return interval
    elif interval == 2:
        return random.randint(2, 3)
    elif interval < 7:
        fuzz = max(1, int(interval * 0.25))
    elif interval < 30:
        fuzz = max(2, int(interval * 0.15))
    else:
        fuzz = max(4, int(interval * 0.05))

    return interval + random.randint(-fuzz, fuzz)


def preview_intervals(
    interval: int,
    factor: int,
    days_overdue: int
) -> dict[int, int]:
    """
    Preview intervals for all 4 ease options without applying fuzz.
    Used for showing interval labels on buttons.

    Args:
        interval: Current interval in days
        factor: Current ease factor (2500 = 250%)
        days_overdue: Days since card was due

    Returns:
        Dict mapping ease (1-4) to predicted interval
    """
    previews = {}

    for ease in range(1, 5):
        if ease == 1:
            new_ivl = 1
        elif ease == 2:
            new_ivl = max(interval + 1, int(interval * 1.2))
        elif ease == 3:
            delay_bonus = days_overdue // 2
            new_ivl = max(interval + 1, int((interval + delay_bonus) * factor / 1000))
        else:  # ease == 4
            delay_bonus = days_overdue
            new_ivl = max(interval + 1, int((interval + delay_bonus) * factor / 1000 * 1.3))

        # Cap at max
        new_ivl = min(new_ivl, 36500)
        previews[ease] = new_ivl

    return previews


def calculate_days_overdue(due_timestamp: int) -> int:
    """
    Calculate how many days a card is overdue.

    Args:
        due_timestamp: Card's due date as days since epoch for review cards

    Returns:
        Days overdue (0 if not overdue, positive if late)
    """
    try:
        # Anki stores due date as days since epoch for review cards
        today = datetime.now().date()

        # Handle edge cases
        if due_timestamp <= 0:
            # Card might be new or in a special state, return 0
            return 0

        # due_timestamp is days since epoch (1970-01-01)
        # This should be around 19000-20000+ for recent dates
        due_date = datetime(1970, 1, 1).date() + timedelta(days=due_timestamp)

        delta = (today - due_date).days
        return max(0, delta)
    except (ValueError, OverflowError):
        # If calculation fails, return 0 as safe default
        return 0


def format_interval(days: int) -> str:
    """
    Format interval for display.

    Args:
        days: Interval in days

    Returns:
        Human-readable string (e.g., "1d", "2mo", "1.5y")
    """
    if days == 1:
        return "1d"
    elif days < 30:
        return f"{days}d"
    elif days < 365:
        months = round(days / 30)
        return f"{months}mo"
    else:
        years = days / 365
        if years == int(years):
            return f"{int(years)}y"
        return f"{years:.1f}y"
