export default {
  MuiCssBaseline: {
    styleOverrides: (theme) => ({
      ':root': {
        colorScheme: theme.palette.mode,
        scrollbarColor: `${theme.palette.text.disabled} ${theme.palette.background.default}`,
        scrollbarWidth: 'thin',
      },
      '*': {
        scrollbarColor: `${theme.palette.text.disabled} ${theme.palette.background.default}`,
        scrollbarWidth: 'thin',
      },
      '*::-webkit-scrollbar': { width: 8, height: 8 },
      '*::-webkit-scrollbar-track, *::-webkit-scrollbar-corner': {
        backgroundColor: theme.palette.background.default,
      },
      '*::-webkit-scrollbar-thumb': {
        backgroundColor: theme.palette.text.disabled,
        borderRadius: 8,
        border: `2px solid ${theme.palette.background.default}`,
      },
      '*::-webkit-scrollbar-thumb:hover': { backgroundColor: theme.palette.text.secondary },
    }),
  },
  MuiUseMediaQuery: {
    defaultProps: {
      noSsr: true,
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.palette.background.default,
        borderRadius: theme.shape.borderRadius,
        paddingLeft: theme.spacing(1),
        paddingRight: theme.spacing(1),
      }),
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 600,
      },
      sizeMedium: {
        height: '40px',
      },
    },
  },
  MuiFormControl: {
    defaultProps: {
      size: 'small',
    },
  },
  MuiSnackbar: {
    defaultProps: {
      anchorOrigin: {
        vertical: 'bottom',
        horizontal: 'center',
      },
    },
  },
  MuiTooltip: {
    defaultProps: {
      enterDelay: 500,
      enterNextDelay: 500,
    },
  },
  MuiAppBar: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({ borderBottom: `1px solid ${theme.palette.divider}` }),
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: ({ theme }) => ({ borderRadius: theme.spacing(2) }),
    },
  },
  MuiMenu: {
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRadius: theme.spacing(1.5),
        boxShadow: theme.shadows[3],
      }),
    },
  },
  MuiAccordion: {
    defaultProps: { disableGutters: true, elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: `${theme.spacing(1.5)} !important`,
        backgroundColor: theme.palette.background.default,
        marginBottom: theme.spacing(1.5),
        '&::before': { display: 'none' },
        '@media print': { border: 0 },
      }),
    },
  },
  MuiAccordionSummary: {
    styleOverrides: {
      root: { minHeight: 56 },
      content: { '& .MuiTypography-root': { fontWeight: 600 } },
    },
  },
  MuiTable: {
    styleOverrides: {
      root: ({ theme }) => ({ backgroundColor: theme.palette.background.paper }),
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: ({ theme }) => ({
        '&:last-child td': { borderBottom: 0 },
        '&.MuiTableRow-hover:hover': { backgroundColor: theme.palette.action.hover },
      }),
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderBottomColor: theme.palette.divider,
        '@media print': {
          color: theme.palette.alwaysDark.main,
        },
      }),
      head: ({ theme }) => ({
        backgroundColor: theme.palette.background.default,
        color: theme.palette.text.secondary,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        '@media print': { color: theme.palette.alwaysDark.main },
      }),
    },
  },
};
